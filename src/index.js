class LocalStorageAdapter {
    get(_storageName) {
        return new Promise(_resolve => _resolve(
            JSON.parse(window.localStorage.getItem(_storageName))
        ));
    }

    set(_storageName, _data) {
        return new Promise(_resolve => _resolve(
            window.localStorage.setItem(_storageName, JSON.stringify(_data))
        ));
    }
}

class LocalVariableAdapter {
    constructor(_this) {
        this.context = _this;
    }

    get(_storageName) {
        return new Promise(_resolve => _resolve(this.context.data));
    }

    set(_storageName, _data) {
        return new Promise(_resolve => _resolve(this.context.data = _data));
    }
}

class Repository {

    constructor(_config) {
        this.config = _config;
        this.syncInterval = null;
        this.data = null;

        switch(this.config.storage) {
            case 'LOCAL_VARIABLE':
                this.storage = new LocalVariableAdapter(this);
                break;
            case 'LOCAL_STORAGE':
            default:
                this.storage = new LocalStorageAdapter();
                break;
        }
    }

    _normalizeData(_response) {
        const obj = {};

        Object.keys(this.config.dataModel).forEach(
            key => obj[key] = _response[this.config.dataModel[key]]
        );

        return obj;
    }

    /**
     * Checks if repository the data is up to date or not.
     *
     * @return {Boolean}
     */
    _isDataUpToDate(_localStore) {
        const isDataMissing =
            _localStore === null || Object.keys(_localStore.data).length === 0;

        if (isDataMissing) {
            return false;
        }

        if (_localStore.isInvalid) {
            return false;
        }

        const { lastFetched } = _localStore;

        const isLimitExceeded =
            (new Date().valueOf() - lastFetched) > this.config.cacheLimit;

        return ! isLimitExceeded;
    }

    _storeData(_data) {
        this.storage.set(this.config.name, {
            lastFetched: new Date().valueOf(),
            isInvalid: false,
            data: _data
        });
    }

    invalidateData() {
        return this.storage.get(this.config.name).then(_data =>
            this.storage.set(this.config.name, Object.assign({}, _data, {
                isInvalid: true
            }))
        );
    }

    clearData() {
        return this.storage.set(this.config.name, null);
    }

    /**
     * Access the repository data.
     *
     * @return {Promise}
     */
    getData(){
        const localData = this.storage.get(this.config.name);

        return new Promise(_resolve => {
            localData.then(_localData => {
                if (this._isDataUpToDate(_localData)) {
                    _resolve(_localData.data);
                } else {
                    this.config.request()
                        .then(this._normalizeData.bind(this))
                        .then(response => {
                            this._storeData(response);

                            return response;
                        })
                        .then(_resolve);
                }
            });
        });
    }

    _initSyncInterval(_interval) {
        this.syncInterval = setInterval(
            () => this.getData(), _interval
        );
    }

    initSyncer() {
        this.storage.get(this.config.name).then(_localData => {
            if (this._isDataUpToDate(_localData)) {
                const { lastFetched } = _localData;
                const diff = new Date().valueOf() - lastFetched;

                this.syncInterval = this._initSyncInterval(diff);

                setTimeout( () => {
                    this.syncInterval = this._initSyncInterval(this.config.cacheLimit);
                }, diff);
            } else {
                this.getData().then(r => {
                    this.syncInterval = this._initSyncInterval(this.config.cacheLimit)

                    return r;
                });
            }
        });
    }

    destroySyncer() {
        this.syncInterval = null;
    }
};


/**
 * Uses Node, AMD or browser globals to create a module. This example creates
 * a global even when AMD is used. This is useful if you have some scripts
 * that are loaded by an AMD loader, but they still want access to globals.
 *
 * {@link https://github.com/umdjs/umd/blob/master/templates/returnExportsGlobal.js}
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], function () {
            return (root.returnExportsGlobal = factory());
        });
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals
        root.returnExportsGlobal = factory();
    }
}(this, function () {
    // Just return a value to define the module export.
    // This example returns an object, but the module
    // can return a function as the exported value.
    return Repository;
}));
