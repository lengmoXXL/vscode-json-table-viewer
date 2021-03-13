import * as JSON5 from "json5"

class HeaderItem {
    private _attrs: Set<string>;
    private _childs: Map<string, HeaderItem>;
    private _size: number;
    private _level: number;

    constructor(level: number = 0) {
        this._attrs = new Set();
        this._childs = new Map();
        this._size = 0;
        this._level = level;
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
    private divs: {column: number, row: number, rowSpan: number, data: string}[];

    constructor(text: string) {
        this.json = JSON5.parse(text);
        this.header = new HeaderItem(0);
        this.divs = [];
        this.maxHeaderDepth = this.buildHeader("", this.json, this.header);
        this.header.callSize();
        this.getBodySpan(this.header, this.json, this.maxHeaderDepth + 1, 1);
    }

    buildHeader(prefix: string, partialJson: object, partialHeader: HeaderItem): number {
        let ret = 1;
        if (partialJson instanceof Array) {
            let header: HeaderItem = partialHeader.getOrAddChild(prefix + ".*");

            if (partialJson.length == 0) {
                header.addAttr(".value");
            }

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

    getBodySpan(partialHeader: HeaderItem, partialJson: object, rowBase: number, columnBase: number): number {
        let ret = 1;
        let currentColumnBase = columnBase + partialHeader.attrs.size;
        for (let [k,item] of partialHeader.children.entries()) {
            let childJson = this.getByPath(k, partialJson);
            if (childJson && childJson instanceof Array) {
                let update = 0;
                for (let child of childJson) {
                    update += this.getBodySpan(item, child, rowBase + update, currentColumnBase);
                }
                ret = Math.max(ret, update);
            }
            currentColumnBase += item.size;
        }

        let i = 0;
        for (let attr of partialHeader.attrs) {
            let value = this.getByPath(attr, partialJson);
            if (value) {
                this.divs.push({
                    row: rowBase,
                    column: columnBase + i,
                    rowSpan: ret,
                    data: JSON.stringify(value)});
            } else {
                this.divs.push({
                    row: rowBase,
                    column: columnBase + i,
                    rowSpan: ret,
                    data: ""});
            }

            ++ i;
        }

        return ret;
    }

    tableHeaderHTML(): string {
        let divs: string[] = [];
        let totalRowSpan = this.maxHeaderDepth;
        let q: {index: number, item: HeaderItem}[] = [{index: 1, item: this.header}];

        while (q.length > 0) {
            let item = q.shift();
            if (!item) {
                break;
            }

            let header = item.item;
            let index = item.index;
            if (!header) {
                break;
            }

            let rowSpan = totalRowSpan - header.level;
            
            for (let attr of header.attrs) {
                divs.push(`<div class="table-header table-item" style="grid-column: ${index} / span 1; grid-row: span ${rowSpan};">${attr}</div>`);
                ++ index;
            }

            for (let [k, v] of header.children) {
                divs.push(`<div class="table-header table-item" style="grid-column: ${index} / span ${v.size}; grid-row: span 1;">${k}</div>`);
                q.push({index: index, item: v});
                index += v.size;
            }
        }

        return divs.join("");
    }

    tableBodyHTML(): string {
        let divStrings: string[] = [];
        for (let div of this.divs) {
            divStrings.push(`<div class="table-item" style="grid-column-start: ${div.column}; grid-row: ${div.row} / span ${div.rowSpan};">${div.data}</div>`)
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