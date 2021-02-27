class HeaderItem {
    public index: number;

    private _attrs: Set<string>;
    private _childs: Map<string, HeaderItem>;
    private _size: number;
    private _level: number;

    constructor(level: number = 0) {
        this._attrs = new Set();
        this._childs = new Map();
        this._size = 0;
        this._level = level;
        this.index = -1;
    }

    get attrs(): Set<string> {
        return this._attrs;
    }

    get children(): Map<string, HeaderItem> {
        return this._childs;
    }

    get size(): number {
        return this._size;
    }

    get level(): number {
        return this._level;
    }

    addAttr(attr: string) {
        this._attrs.add(attr);
    }

    addChild(field: string, child: HeaderItem) {
        child._level = this._level + 1;
        this._childs.set(field, child);
    }

    getOrAddChild(field: string): HeaderItem {
        let ret = this._childs.get(field);
        if (ret) {
            return ret;
        }
        
        ret = new HeaderItem(this._level+ 1);
        this.addChild(field, ret);
        return ret;
    }

    public callSize() {
        this._size = this._attrs.size;
        for (let item of this._childs) {
            item[1].callSize();
            this._size += item[1].size;
        }
    }
}

export class JSONTable {
    private json: object;
    private header: HeaderItem;
    private maxHeaderDepth: number;
    private divs: {rowSpan: number, data: string}[][];

    constructor(text: string) {
        this.json = JSON.parse(text);
        this.header = new HeaderItem(0);
        this.divs = [];
        this.maxHeaderDepth = this.buildHeader("", this.json, this.header);
        this.header.callSize();
        this.expandDivs(this.header);

        let maxBodySpan = this.getBodySpan(this.header, this.json);
        this.fullFill(maxBodySpan);

        // console.log(JSON.stringify(this.divs));
    }

    buildHeader(prefix: string, partialJson: object, partialHeader: HeaderItem): number {
        let ret = 1;
        if (partialJson instanceof Array) {
            let header: HeaderItem = partialHeader.getOrAddChild(prefix + ".*");

            for (let json of partialJson) {
                ret = Math.max(ret, this.buildHeader("", json, header) + 1);
            }
        } else if (partialJson instanceof Object) {
            for (let [k, v] of Object.entries(partialJson)) {
                ret = Math.max(ret, this.buildHeader(prefix + "." + k, v, partialHeader));
            }
        } else if (partialJson) {
            partialHeader.addAttr(prefix + ".value");
        }
        return ret;
    }

    expandDivs(partialHeader: HeaderItem) {
        partialHeader.index = this.divs.length;
        for (let i = 0; i < partialHeader.attrs.size; ++ i) {
            this.divs.push([]);
        }

        for (let [k, item] of partialHeader.children.entries()) {
            this.expandDivs(item);
        }
    }

    getByPath(path: string, json: any): object | undefined {
        if (!json) {
            return undefined;
        }
        if (path == ".*") {
            if (json instanceof Array) {
                return json;
            }
            return undefined;
        }

        let ret = json;
        let steps = path.split(".");
        for (let step of steps.slice(1, -1)) {
            // console.log(ret, step);
            if (step in ret) {
                ret = ret[step];
                if (!ret) {
                    return ret;
                }
            } else {
                return undefined;
            }
        }

        let step = steps[steps.length - 1];
        if (step == '*' || step == 'value') {
            return ret;
        }

        // console.log(ret, step);
        if (step in ret) {
            ret = ret[step];
            if (!ret) {
                return ret;
            }
        } else {
            return undefined;
        }
        return ret;
    }

    getBodySpan(partialHeader: HeaderItem, partialJson: object): number {
        let ret = 1;
        for (let [k,item] of partialHeader.children.entries()) {
            let childJson = this.getByPath(k, partialJson);
            if (childJson && childJson instanceof Array) {
                let update = 0;
                for (let child of childJson) {
                    update += this.getBodySpan(item, child);
                }
                ret = Math.max(ret, update);
            }
        }

        let i = 0;
        for (let attr of partialHeader.attrs) {
            let value = this.getByPath(attr, partialJson);
            if (value) {
                this.divs[partialHeader.index + i].push({rowSpan: ret, data: JSON.stringify(value)});
            } else {
                this.divs[partialHeader.index + i].push({rowSpan: ret, data: ""});
            }

            ++ i;
        }

        return ret;
    }

    fullFill(maxSpan: number) {
        for (let col of this.divs) {
            let span = maxSpan;
            for (let cell of col) {
                span -= cell.rowSpan;
            }
            if (span > 0) {
                let lastCell = col.pop();
                if (lastCell) {
                    lastCell.rowSpan += span;
                    col.push(lastCell);
                }
            }
        }
    }

    tableHeaderHTML(): string {
        let divs: string[] = [];
        let totalRowSpan = this.maxHeaderDepth;
        let q: HeaderItem[] = [this.header];

        while (q.length > 0) {
            let header = q.shift();
            if (!header) {
                break;
            }

            let rowSpan = totalRowSpan - header.level;
            
            for (let attr of header.attrs) {
                divs.push(`<div class="table-header table-item" style="grid-column: span 1; grid-row: span ${rowSpan};">${attr}</div>`);
            }

            for (let [k, v] of header.children) {
                divs.push(`<div class="table-header table-item" style="grid-column: span ${v.size}; grid-row: span 1;">${k}</div>`);
                q.push(v);
            }
        }

        return divs.join("");
    }

    tableBodyHTML(): string {
        let divStrings: string[] = [];
        let index = 1;
        for (let col of this.divs) {
            let rowIndex = this.maxHeaderDepth + 1;
            for (let cell of col) {
                divStrings.push(`<div class="table-item" style="grid-column-start: ${index}; grid-row: ${rowIndex} / span ${cell.rowSpan};">${cell.data}</div>`)
                rowIndex += cell.rowSpan;
            }
            ++ index;
        }

        return divStrings.join("");
    }

    getHTML(): string {
        return `<!DOCTYPE html>
        <html>
            <header>
                <title>JSON Table Viewer</title>
                <style>
                    .json-table {
                        display: grid;
                        grid-template-columns: repeat(` + this.header.size + `, 1fr);
                        row-gap: 1px;
                        column-gap: 1px;
                    }
        
                    .table-header {
                        font-weight: bold;
                    }
        
                    .table-item {
                        text-align: center;
                        background-color: antiquewhite;
                    }
                </style>
            </header>
            <body>
                <div class="json-table">
                    ` + this.tableHeaderHTML() + `
                    ` + this.tableBodyHTML() + `
                </div>
            </body>
        
        </html>`;
    }
}