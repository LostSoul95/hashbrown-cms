'use strict';

/**
 * The editor for Connections
 *
 * @memberof HashBrown.Client.Views.Editors
 */
class ConnectionEditor extends HashBrown.Views.Editors.ResourceEditor {
    /**
     * Fetches the model
     *
     * @param {Boolean} skipModel
     */
    async fetch(skipModel = false) {
        if(skipModel) {
            return super.fetch();
        }
        
        try {
            this.model = await HashBrown.Helpers.ConnectionHelper.getConnectionById(this.modelId);

            super.fetch();

        } catch(e) {
            UI.errorModal(e);

        }
    }

    /**
     * Event: Click advanced. Routes to the JSON editor
     */
    onClickAdvanced() {
        location.hash = '/connections/json/' + this.model.id;
    }

    /**
     * Event: Click save
     */
    async onClickSave() {
        this.$saveBtn.toggleClass('working', true);

        try {
            await HashBrown.Helpers.ResourceHelper.set('connections', this.model.id, this.model);
                
            HashBrown.Helpers.EventHelper.trigger('resource');  
        
        } catch(e) {
            UI.errorModal(e);

        }

        this.$saveBtn.toggleClass('working', false);
    }

    /**
     * Renders the Media provider editor
     */
    renderMediaProviderEditor() {
        let input = new HashBrown.Views.Widgets.Input({
            value: false,
            type: 'checkbox',
            onChange: (isProvider) => {
                HashBrown.Helpers.ConnectionHelper.setMediaProvider(isProvider ? this.model.id : null)
                .catch(UI.errorModal);
            }
        });

        // Set the value
        input.$element.toggleClass('working', true);

        HashBrown.Helpers.ConnectionHelper.getMediaProvider()
        .then((connection) => {
            if(connection && connection.id === this.model.id) {
                input.value = true;
                input.fetch();
            }
        
            input.$element.toggleClass('working', false);
        });

        return input.$element;
    }

    /**
     * Renders this editor
     */
    template() {
        return _.div({class: 'editor editor--connection' + (this.model.isLocked ? ' locked' : '')},
            _.div({class: 'editor__header'},
                _.span({class: 'editor__header__icon fa fa-exchange'}),
                _.h4({class: 'editor__header__title'}, this.model.title)
            ),
            _.div({class: 'editor__body'},
                // Media provider
                this.field(
                    'Is Media provider',
                    this.renderMediaProviderEditor()
                ),
                
                // Title
                this.field(
                    'Title',
                    new HashBrown.Views.Widgets.Input({
                        value: this.model.title,
                        onChange: (newValue) => {
                            this.model.title = newValue;
                        }
                    })
                ),

                // URL
                this.field(
                    'URL',
                    new HashBrown.Views.Widgets.Input({
                        value: this.model.url,
                        onChange: (newValue) => {
                            this.model.url = newValue;
                        }
                    })
                ),

                // Processor settings
                this.field(
                    { label: 'Processor', description: 'Which format to deploy Content in' },
                    this.field(
                        'Type',
                        new HashBrown.Views.Widgets.Dropdown({
                            value: this.model.processor.alias,
                            optionsUrl: 'connections/processors', 
                            placeholder: 'Type',
                            onChange: (newValue) => {
                                this.model.processor.alias = newValue;

                                this.fetch(true);
                            }
                        })
                    ),
                    this.field(
                        { label: 'File extension', description: 'A file extension such as .json or .xml'},
                        _.each(HashBrown.Views.Editors.ProcessorEditors, (name, editor) => {
                            if(editor.alias !== this.model.processor.alias) { return; }
                                
                            return new editor({
                                model: this.model.processor
                            });
                        }),
                        new HashBrown.Views.Widgets.Input({
                            value: this.model.processor.fileExtension,
                            onChange: (newValue) => {
                                this.model.processor.fileExtension = newValue;
                            }
                        })
                    )
                ),
                
                // Deployer settings
                this.field(
                    { label: 'Deployer', description: 'How to transfer data to and from the website\'s server' },
                    this.field(
                        'Type',
                        new HashBrown.Views.Widgets.Dropdown({
                            value: this.model.deployer.alias,
                            optionsUrl: 'connections/deployers', 
                            placeholder: 'Type',
                            onChange: (newValue) => {
                                this.model.deployer.alias = newValue;

                                this.fetch(true);
                            }
                        })
                    ),
                    _.each(HashBrown.Views.Editors.DeployerEditors, (name, editor) => {
                        if(editor.alias !== this.model.deployer.alias) { return; }
                            
                        return new editor({
                            model: this.model.deployer
                        }).$element;
                    }),
                    _.do(() => {
                        if(!this.model.deployer || !this.model.deployer.paths) { return; }
                        
                        return this.field(
                            { label: 'Paths', description: 'Where to send the individual resources' },
                            this.field(
                                'Content',
                                new HashBrown.Views.Widgets.Input({
                                    value: this.model.deployer.paths.content,
                                    onChange: (newValue) => {
                                        this.model.deployer.paths.content = newValue;
                                    }
                                })
                            ),
                            this.field(
                                'Media',
                                new HashBrown.Views.Widgets.Input({
                                    value: this.model.deployer.paths.media,
                                    onChange: (newValue) => {
                                        this.model.deployer.paths.media = newValue;
                                    }
                                })
                            )
                        );
                    })
                )
            ),
            _.div({class: 'editor__footer'}, 
                _.div({class: 'editor__footer__buttons'},
                    _.button({class: 'widget widget--button embedded'},
                        'Advanced'
                    ).click(() => { this.onClickAdvanced(); }),
                    _.if(!this.model.isLocked, 
                        this.$saveBtn = _.button({class: 'widget widget--button editor__footer__buttons__save'},
                            _.span({class: 'widget--button__text-default'}, 'Save '),
                            _.span({class: 'widget--button__text-working'}, 'Saving ')
                        ).click(() => { this.onClickSave(); })
                    )
                )
            )
        );
    }
}

module.exports = ConnectionEditor;
