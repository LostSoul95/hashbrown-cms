'use strict';

/**
 * An editor for referring to other Content
 *
 * @description Example:
 * <pre>
 * {
 *     "myContentReference": {
 *         "label": "My content reference",
 *         "tabId": "content",
 *         "schemaId": "contentReference",
 *         "config": {
 *            "allowedSchemas": [ "page", "myCustomSchema" ]
 *         }
 *     }
 * }
 * </pre>
 *
 * @memberof HashBrown.Client.Views.Editors.FieldEditors
 */
class ContentReferenceEditor extends HashBrown.Views.Editors.FieldEditors.FieldEditor {
    constructor(params) {
        super(params);

        this.fetch();
    }

    /**
     * Event: Change value
     */
    onChange(newValue) {
        this.value = newValue;

        this.trigger('change', this.value);
    }

    /**
     * Gets a list of allowed Content options
     *
     * @returns {Array} List of options
     */
    async getDropdownOptions() {
        let allContent = await HashBrown.Helpers.ContentHelper.getAllContent();
        let allowedContent = [];
        let areRulesDefined = this.config && Array.isArray(this.config.allowedSchemas) && this.config.allowedSchemas.length > 0;

        for(let content of allContent) {
            if(areRulesDefined) {
                let isContentAllowed = this.config.allowedSchemas.indexOf(content.schemaId) > -1;
                
                if(!isContentAllowed) { continue; }
            }

            allowedContent[allowedContent.length] = {
                title: content.prop('title', HashBrown.Context.language) || content.id,
                id: content.id
            };
        }

        return allowedContent;
    }
    
    /**
     * Gets the field label
     *
     * @return {String} Label
     */
    getFieldLabel() {
        if(this.model && this.model.prop('title', HashBrown.Context.language)) {
            return this.model.prop('title', HashBrown.Context.language); 
        }

        return super.getFieldLabel();
    }

    /**
     * Renders the config editor
     *
     * @param {Object} config
     *
     * @returns {HTMLElement} Element
     */
    static renderConfigEditor(config) {
        config.allowedSchemas = config.allowedSchemas || [];
        
        return this.field(
            'Allowed Schemas',
            new HashBrown.Views.Widgets.Dropdown({
                options: HashBrown.Helpers.SchemaHelper.getAllSchemas('content'),
                useMultiple: true,
                value: config.allowedSchemas,
                useClearButton: true,
                valueKey: 'id',
                labelKey: 'name',
                onChange: (newValue) => {
                    config.allowedSchemas = newValue;
                }
            })
        );
    }

    /**
     * Render this editor
     */
    template() {
        return _.div({class: 'field-editor field-editor--content-reference'}, [
            new HashBrown.Views.Widgets.Dropdown({
                value: this.value,
                options: this.getDropdownOptions(),
                useTypeAhead: true,
                valueKey: 'id',
                useClearButton: true,
                labelKey: 'title',
                onChange: (newValue) => {
                    this.value = newValue;

                    this.trigger('change', this.value);
                }
            }).$element
        ]);
    }
}

module.exports = ContentReferenceEditor;
