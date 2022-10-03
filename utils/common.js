const fs = require('fs');

/** Class to sync JSON data to/from a file. */
module.exports.JSONHandler = class {
    /** Constructs the JSON handler for a given path.
     * @param {string} path The path to the file to sync.
     */
    constructor(path) {
        this.file = path;
        try {
            this.JSON = fs.readFileSync(this.file, { flag: 'r+', encoding: 'utf8' });
            this.JSON = this.JSON != null ? JSON.parse(this.JSON.toString()) : {};
        }
        catch(reason) {
            try {
                this.JSON = {}; fs.mkdirSync(dirname(this.file), { recursive: true });
                fs.writeFileSync(this.file, '', { flag: 'w+', encoding: 'utf8' });
            }
            catch(reason) { console.error("Create error:", reason); }
        }
    }
    /** Synchronizes data into the file. */
    sync() {
        try { fs.writeFileSync(this.file, JSON.stringify(this.JSON, null, 4), { flag: 'w+', encoding: 'utf8' }); }
        catch(reason) { console.error("Write Error:", reason); }
    }
};