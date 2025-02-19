'use strict';

const FileSystem = require('fs');
const Path = require('path');

/**
 * The Media controller
 *
 * @memberof HashBrown.Server.Controllers
 */
class MediaController extends HashBrown.Controllers.ApiController {
    /**
     * Initiates this controller
     */
    static init(app) {
        app.get('/media/:project/:environment/:id', this.middleware({ authenticate: false }), this.serve);
        
        app.get('/api/:project/:environment/media/tree', this.middleware(), this.getTree);
        app.get('/api/:project/:environment/media/:id', this.middleware(), this.get);
        app.get('/api/:project/:environment/media', this.middleware(), this.getAll);
        
        app.post('/api/:project/:environment/media/new', this.middleware(), this.new);
        app.post('/api/:project/:environment/media/tree/:id', this.middleware(), this.setTree);
        app.post('/api/:project/:environment/media/:id', this.middleware(), this.set);
        app.post('/api/:project/:environment/media/rename/:id', this.middleware(), this.rename);
        
        app.delete('/api/:project/:environment/media/:id', this.middleware(), this.remove);
    }
    
    /**
     * Serves Media content
     */
    static async serve(req, res) {
        let id = req.params.id;

        if(id.indexOf('?') > -1) {
            id = id.substring(0, id.indexOf('?'));
        }

        try {
            let connection = await HashBrown.Helpers.ConnectionHelper.getMediaProvider(req.project, req.environment);
            let media = await connection.getMedia(id);

            if(!media || (!media.url && !media.path)) {
                return res.status(404).send('Not found');
            }
            
            let data = await HashBrown.Helpers.MediaHelper.getCachedMedia(req.project, media, parseInt(req.query.width), parseInt(req.query.height));
            
            res.writeHead(200, {'Content-Type': media.getContentTypeHeader()});
            res.end(data);

        } catch(e) {
            res.status(404).end(e.message); 
        }
    }
    
    /**
     * @example GET /api/:project/:environment/media/tree
     *
     * @param {String} project
     * @param {String} environment
     *
     * @returns {Object} Media tree
     */
    static async getTree(req, res) {
        try {
            let tree = await HashBrown.Helpers.MediaHelper.getTree(req.project, req.environment);
            
            res.status(200).send(tree);
        
        } catch(e) {
            res.status(404).send(MediaController.printError(e));
        
        }     
    }
    
    /**
     * @example POST /api/:project/:environment/media/tree/:id
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     
     * @param {Object} item
     *
     * @returns {Object} Media tree item
     */
    static async setTree(req, res) {
        let id = req.params.id;
        let item = req.body;

        try {
            await HashBrown.Helpers.MediaHelper.setTreeItem(req.project, req.environment, id, item);
            
            res.status(200).send(item);
        
        } catch(e) {
            res.status(502).send(MediaController.printError(e));
        
        }
    }
    
    /**
     * @example GET /api/:project/:environment/media
     *
     * @param {String} project
     * @param {String} environment
     
     * @returns {Array} All Media nodes
     */
    static async getAll(req, res) {
        try {
            let connection = await HashBrown.Helpers.ConnectionHelper.getMediaProvider(req.project, req.environment);

            if(!connection) { return res.status(200).send([]); }

            let media = await connection.getAllMedia();
                
            let tree = await HashBrown.Helpers.MediaHelper.getTree(req.project, req.environment);

            for(let i in media) {
                media[i].applyFolderFromTree(tree);  
            }

            res.status(200).send(media);
        
        } catch(e) {
            res.status(404).send(MediaController.printError(e));    
        
        }
    }
    
    /**
     * @example GET /api/:project/:environment/media/:id
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     
     * @returns {Media} Media
     */
    static async get(req, res) {
        try {
            let id = req.params.id;

            let connection = await HashBrown.Helpers.ConnectionHelper.getMediaProvider(req.project, req.environment);

            let media = await connection.getMedia(id);
            
            if(!media) {
                throw new Error('Connection "' + connection.id + '" failed to fetch media "' + id + '"');
            }

            let tree = await HashBrown.Helpers.MediaHelper.getTree(req.project, req.environment);

            media.applyFolderFromTree(tree);

            res.status(200).send(media);
        
        } catch(e) {
            res.status(404).send(e.message);    
        
        }     
    }
    
    /**
     * @example DELETE /api/:project/:environment/media/:id
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     */
    static async remove(req, res) {
        try {
            let id = req.params.id;

            await HashBrown.Helpers.MediaHelper.removeCachedMedia(req.project, id);

            let connection = await HashBrown.Helpers.ConnectionHelper.getMediaProvider(req.project, req.environment);

            await connection.removeMedia(id);
            
            res.sendStatus(200);
        
        } catch(e) {
            res.status(404).send(MediaController.printError(e));
        
        }    
    }
    
    /**
     * @example POST /api/:project/:environment/media/rename/:id
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     * @param {String} name
     */
    static async rename(req, res) {
        try {
            let id = req.params.id;
            let name = req.query.name;

            await HashBrown.Helpers.MediaHelper.renameMedia(req.project, req.environment, id, name);
            
            res.status(200).send(id);

        } catch(e) {
            res.status(400).send(MediaController.printError(e));
        
        }
    }
    
    /**
     * @example POST /api/:project/:environment/media/:id { filename: 'file.png', base64: ... }
     *
     * @param {String} project
     * @param {String} environment
     * @param {String} id
     *
     * @param {String} filename
     * @param {String} base64
     */
    static async set(req, res) {
        try {
            let file = req.body.files[0];
            
            if(!file) {
                throw new Error('No files provided');
            }

            let connection = await HashBrown.Helpers.ConnectionHelper.getMediaProvider(req.project, req.environment);

            await HashBrown.Helpers.MediaHelper.removeCachedMedia(req.project, req.params.id);

            await connection.setMedia(req.params.id, file.filename, file.base64);

            res.status(200).send(req.params.id);

        } catch(e) {
            res.status(500).send(MediaController.printError(e));    

        }
    }

    /**
     * @example GET /api/:project/:environment/media/new
     *
     * @param {String} project
     * @param {String} environment
     *
     * @param {Array} files Binary Media data
     *
     * @returns {String} Created Media id
     */
    static async new(req, res) {
        try {
            let connection = await HashBrown.Helpers.ConnectionHelper.getMediaProvider(req.project, req.environment);
            
            let ids = [];

            for(let file of req.body.files) {
                let media = HashBrown.Models.Media.create();

                await connection.setMedia(media.id, file.filename, file.base64);
                
                ids.push(media.id);
            }

            res.status(200).send(ids);
        
        } catch(e) {
            res.status(500).send(MediaController.printError(e));    
        
        }
    }
}

module.exports = MediaController;
