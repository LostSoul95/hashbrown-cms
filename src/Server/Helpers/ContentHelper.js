'use strict';

const ContentHelperCommon = require('Common/Helpers/ContentHelper');

/**
 * The helper class for Content
 *
 * @memberof HashBrown.Server.Helpers
 */
class ContentHelper extends ContentHelperCommon {
    /**
     * Gets all Content objects
     *
     * @param {String} project
     * @param {String} environment
     *
     * @return {Array} Content
     */
    static async getAllContent(project, environment) {
        checkParam(project, 'project', String);
        checkParam(environment, 'environment', String);

        let collection = environment + '.content';

        let results = await HashBrown.Helpers.DatabaseHelper.find(project, collection, {}, {}, { sort: 1 });

        let contentList = [];

        for(let i in results) {
            let content = new HashBrown.Models.Content(results[i]);

            // Make sure runaway publish dates are not included
            content.publishOn = null;
            content.unpublishOn = null;
            
            contentList[contentList.length] = content;

        }

        return await HashBrown.Helpers.SyncHelper.mergeResource(project, environment, 'content', contentList);
    }

    /**
     * Gets a Content object by id
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     * @param {Boolean} localOnly
     *
     * @return {Promise} Promise
     */
    static async getContentById(project, environment, id, localOnly = false) {
        checkParam(project, 'project', String);
        checkParam(environment, 'environment', String);
        checkParam(id, 'id', String);

        let result = await HashBrown.Helpers.DatabaseHelper.findOne(project, environment + '.content', { id: id });

        if(!result && !localOnly) {
            result = await HashBrown.Helpers.SyncHelper.getResourceItem(project, environment, 'content', id);
        }

        if(!result) { throw new Error('Content by id "' + id + '" was not found'); }

        let content = new HashBrown.Models.Content(result);

        // Make sure runaway publish dates are not included
        content.publishOn = null;
        content.unpublishOn = null;

        let tasks = await HashBrown.Helpers.ScheduleHelper.getTasks(null, content.id);
        
        content.adoptTasks(tasks);

        return content;
    }
   
    /**
     * Updates a Content object (quick, no checks)
     *
     * @param {String} project
     * @param {String} environment
     * @param {Content} content
     */
    static async updateContent(project, environment, content) {
        checkParam(project, 'project', String);
        checkParam(environment, 'environment', String);
        checkParam(content, 'content', HashBrown.Models.Content);

        return await HashBrown.Helpers.DatabaseHelper.updateOne(project, environment + '.content', { id: content.id }, content.getObject());
    }

    /**
     * Sets a Content object by id
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     * @param {Content} content
     * @param {User} user
     * @param {Boolean} create
     *
     * @return {Content} Modified content
     */
    static async setContentById(project, environment, id, content, user, create = false) {
        checkParam(project, 'project', String);
        checkParam(environment, 'environment', String);
        checkParam(id, 'id', String);
        checkParam(content, 'content', HashBrown.Models.Content);
        checkParam(user, 'user', HashBrown.Models.User);

        // Check for empty Content object
        if(!content || Object.keys(content).length < 1) { throw new Error('Posted content with id "' + id + '" is empty'); }

        // Check for self parent
        if(content.parentId == id) { throw new Error('Content "' + id + '" cannot be a child of itself'); }

        // Check for allowed Schemas
        if(content.parentId) {
            let isAllowed = await this.isSchemaAllowedAsChild(project, environment, content.parentId, content.schemaId);

            if(!isAllowed) { throw new Error('This type of content is not allowed here'); }
        }

        // If sort value is negative or 0, assign the highest possible number
        if(content.sort <= 0) {
            content.sort = await this.getBottomSortIndex(project, environment, content.parentId);
        }

        // Unset automatic flags
        content.isLocked = false;

        content.sync = {
            isRemote: false,
            hasRemote: false
        };

        // Content update data
        content.updatedBy = user.id;
        content.updateDate = Date.now();
        
        // Fallback in case of no "created by" user
        if(!content.createdBy) {
            content.createdBy = content.updatedBy;
        }
        
        // Handle scheduled publish task
        if(content.publishOn) {
            await HashBrown.Helpers.ScheduleHelper.updateTask(project, environment, 'publish', id, content.publishOn, user);
        } else {
            await HashBrown.Helpers.ScheduleHelper.removeTask(project, environment, 'publish', id);
        }
        
        // Handle scheduled unpublish task
        if(content.unpublishOn) {
            await HashBrown.Helpers.ScheduleHelper.updateTask(project, environment, 'unpublish', id, content.unpublishOn, user);
        } else {
            await HashBrown.Helpers.ScheduleHelper.removeTask(project, environment, 'unpublish', id);
        }
        
        // Insert into database
        await HashBrown.Helpers.DatabaseHelper.updateOne(project, environment + '.content', { id: id }, content, { upsert: create });

        debug.log('Done updating content "' + id + '"', this);

        return content;
    }

    /**
     * Inserts content before/after another node
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} contentId
     * @param {String} otherId
     */
    static async insertContent(project, environment, user, contentId, otherId, parentId = '') {
        checkParam(project, 'project', String, true);
        checkParam(environment, 'environment', String, true);
        checkParam(user, 'user', HashBrown.Models.User, true);
        checkParam(contentId, 'contentId', String, true);
        checkParam(otherId, 'otherId', String, true);
        checkParam(parentId, 'parentId', String);
        
        let nodes = await this.getAllContent(project, environment);

        if(!nodes || nodes.length < 1) { throw new Error('Could not find sibling content'); }
        
        // Remove irrelevant nodes
        nodes = nodes.filter((x) => { return x.id !== contentId && (x.parentId === parentId || !x.parentId === !parentId); });
      
        // Find the index of the other node
        let otherNode = nodes.filter((x) => { return x.id === otherId; }).pop();
        
        if(!otherNode) {
            throw new Error('Content "' + otherId + '" was not found under the parent "' + parentId + '"');
        }

        let otherIndex = nodes.indexOf(otherNode);

        if(otherIndex < 0) {
            throw new Error('Content "' + otherId + '" returned invalid index "' + otherIndex + '"');
        }

        // Get the node model
        let node = await this.getContentById(project, environment, contentId);

        // Assign new parent
        if(parentId) {
            let isAllowed = await this.isSchemaAllowedAsChild(project, environment, parentId, node.schemaId);

            if(!isAllowed) { throw new Error('This type of content is not allowed here'); }
        }

        node.parentId = parentId;

        // Assign the new position
        if(otherIndex < nodes.length - 1) {
            nodes.splice(otherIndex + 1, 0, node);
        
        } else {
            nodes.push(node);
        
        }

        // Update all nodes with their new sort index
        for(let i = 0; i < nodes.length; i++) {
            nodes[i].sort = i + 1;

            await this.setContentById(project, environment, nodes[i].id, nodes[i], user);
        }
    }
    
    /**
     * Creates a new content object
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} schemaId
     * @param {String} parentId
     * @param {User} user
     * @param {Object} properties
     *
     * @return {Content} New Content object
     */
    static async createContent(project, environment, schemaId, parentId = null, user, properties = null) {
        checkParam(project, 'project', String);
        checkParam(environment, 'environment', String);
        checkParam(schemaId, 'schemaId', String);
        checkParam(user, 'user', HashBrown.Models.User);

        let schema = await HashBrown.Helpers.SchemaHelper.getSchemaById(project, environment, schemaId);
            
        let content = HashBrown.Models.Content.create(schema.id, properties);
        let collection = environment + '.content';

        debug.log('Creating content "' + content.id + '"...', this);

        content.createdBy = user.id;
        content.updatedBy = content.createdBy;

        if(parentId) {
            let isAllowed = await this.isSchemaAllowedAsChild(project, environment, parentId, content.schemaId);

            if(!isAllowed) { throw new Error('This type of content is not allowed here'); }

            content.parentId = parentId;
            content.sort = await this.getBottomSortIndex(project, environment, parentId);
        }

        await HashBrown.Helpers.DatabaseHelper.insertOne(project, collection, content.getObject());

        debug.log('Content "' + content.id + '" created and inserted into "' + project + '.' + collection + '"', this);

        return content;
    }
   
    /**
     * Gets the next available sorting index (the highest plus one)
     * 
     * @param {String} project
     * @param {String} environment
     * @param {String} parentId
     *
     * @return {Number} Index
     */
    static async getBottomSortIndex(project, environment, parentId = '') {
        checkParam(project, 'project', String);
        checkParam(environment, 'environment', String);
        checkParam(parentId, 'parentId', String);

        let nodes = await HashBrown.Helpers.DatabaseHelper.find(project, environment + '.content', { parentId: parentId });

        if(nodes.length < 1) { return 1; }

        let lastNode = nodes.pop();

        return lastNode.sort + 1;
    }


    /**
     * Removes a content object
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     * @param {Boolean} removeChildren
     *
     * @return {Promise} promise
     */
    static async removeContentById(project, environment, id, removeChildren = false) {
        checkParam(project, 'project', String);
        checkParam(environment, 'environment', String);
        checkParam(id, 'id', String);

        debug.log('Removing content "' + id + '"...', this);

        let collection = environment + '.content';
        
        await HashBrown.Helpers.DatabaseHelper.removeOne(project, collection, { id: id });
        
        // Remove children if specified
        if(removeChildren) {
            await HashBrown.Helpers.DatabaseHelper.remove(project, collection, { parentId: id });

        // If not removing children, we should unset their parent
        } else {
            await HashBrown.Helpers.DatabaseHelper.update(project, collection, { parentId: id }, { parentId: null });
        }
        
        debug.log('Successfully removed content "' + id + '"...', this);
    }
    
    /**
     * Creates example content
     *
     * @param {String} project
     * @param {String} environment
     * @param {User} user
     *
     * @returns {Promise} Result
     */
    static async createExampleContent(project, environment, user) {
        checkParam(project, 'project', String, true);
        checkParam(environment, 'environment', String, true);
        checkParam(user, 'user', HashBrown.Models.User, true);

        // Example page Schema
        let examplePageSchemaId = HashBrown.Models.ContentSchema.createId();
        
        let examplePageSchema = new HashBrown.Models.ContentSchema({
            id: examplePageSchemaId,
            icon: 'file',
            type: 'content',
            defaultTabId: 'content',
            allowedChildSchemas: [ examplePageSchemaId ],
            name: 'Example Page',
            parentSchemaId: 'page',
            fields: {
                properties: {
                    array: {
                        tabId: 'content',
                        label: 'Array',
                        schemaId: 'array',
                        description: 'A list of values',
                        config: {
                            minItems: 0,
                            maxItems: 2,
                            allowedSchemas: [ 'string', 'richText' ]
                        }
                    },
                    boolean: {
                        tabId: 'content',
                        schemaId: 'boolean',
                        label: 'Boolean',
                        description: 'A true/false value'
                    },
                    contentReference: {
                        tabId: 'content',
                        schemaId: 'contentReference',
                        label: 'Content Reference',
                        description: 'A reference to another Content node',
                        config: {
                            allowedSchemas: [ examplePageSchemaId ]
                        }
                    },
                    contentSchemaReference: {
                        tabId: 'content',
                        schemaId: 'contentSchemaReference',
                        label: 'Content Schema Reference',
                        description: 'A reference to a Content Schema',
                        config: {
                            allowedSchemas: [ examplePageSchemaId ]
                        }
                    },
                    date: {
                        tabId: 'content',
                        schemaId: 'date',
                        label: 'Date',
                        description: 'A date picker'
                    },
                    dropdown: {
                        tabId: 'content',
                        schemaId: 'dropdown',
                        label: 'Dropdown',
                        description: 'A dropdown list of options',
                        config: {
                            options: [
                                {
                                    label: 'Option #1',
                                    value: 'option1'
                                },
                                {
                                    label: 'Option #2',
                                    value: 'option2'
                                },
                                {
                                    label: 'Option #3',
                                    value: 'option3'
                                }
                            ]
                        }
                    },
                    language: {
                        tabId: 'content',
                        schemaId: 'language',
                        label: 'Language',
                        description: 'A dropdown list of available languages'
                    },
                    mediaReference: {
                        tabId: 'content',
                        schemaId: 'mediaReference',
                        label: 'Media Reference',
                        description: 'A reference to a Media node'
                    },
                    number: {
                        tabId: 'content',
                        schemaId: 'number',
                        label: 'Number',
                        description: 'A number picker, which can optionally be a slider',
                        config: {
                            step: 0.5,
                            min: 0,
                            max: 10,
                            isSlider: true
                        }
                    },
                    richText: {
                        tabId: 'content',
                        schemaId: 'richText',
                        label: 'Rich Text',
                        description: 'A formatted text field'
                    },
                    string: {
                        tabId: 'content',
                        schemaId: 'string',
                        label: 'String',
                        description: 'A simple text string'
                    },
                    struct: {
                        tabId: 'content',
                        schemaId: 'struct',
                        label: 'Struct',
                        description: 'A combination of fields',
                        config: {
                            struct: {
                                string: {
                                    schemaId: 'string',
                                    label: 'String',
                                    description: 'A simple text string'
                                },
                                boolean: {
                                    schemaId: 'boolean',
                                    label: 'Boolean',
                                    description: 'A true/false value'
                                }
                            }
                        }
                    },
                    tags: {
                        tabId: 'content',
                        schemaId: 'tags',
                        label: 'Tags',
                        description: 'A comma-separated list of tags'
                    }
                }
            }
        });

        // Example page Content node
        let examplePageContent = new HashBrown.Models.Content({
            id: HashBrown.Models.Content.createId(),
            createDate: Date.now(),
            updateDate: Date.now(),
            schemaId: examplePageSchema.id,
            sort: 1,
            properties: {
                url: '/my-example-page/',
                title: 'My Example Page',

            }
        });

        // Create example page
        await HashBrown.Helpers.SchemaHelper.setSchemaById(project, environment, examplePageSchema.id, examplePageSchema, true);
        await this.setContentById(project, environment, examplePageContent.id, examplePageContent, user, true);
    }
}

module.exports = ContentHelper;
