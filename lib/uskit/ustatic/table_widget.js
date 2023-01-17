import * as util from "./util.js";
import * as debug from "./debug.js";
import * as table_element from "./table_element.js";
import * as abstract_widget from "./abstract_widget.js";
import * as filter_widget from "./filter_widget.js";


/* ***************************************************************************
* TABLE WIDGET
*/

export class TableWidget extends abstract_widget.AbstractWidget {
    #rowseq = 0;
    #element = null;
    #filterWidgets = {};
    #opts = {};

    constructor(element, opts={}) {
        super(element, opts)

        /* Option defaults */
        this.#opts = Object.assign(this.#opts, opts);
        this.#opts.rowselect      ??= true;
        this.#opts.multiselect    ??= true;
        this.#opts.usersortable   ??= true;
        this.#opts.userfilterable ??= true;
        this.#opts.sortBy         ??= null;
        this.#opts.sortDir        ??= "asc";

        this.#element = element;

        const thObserver = new MutationObserver(async (mutationList) => await this.#onThMutation(mutationList));
        const tdObserver = new MutationObserver(async (mutationList) => await this.#onTdMutation(mutationList));
        const thead = element.querySelector(":scope > table > thead > tr:nth-child(1)");
        const tbody = element.querySelector(":scope > table > tbody");

        thObserver.observe(thead, {
            childList     : true,
            subtree       : false,
            characterData : false,
        });

        tdObserver.observe(tbody, {
            childList     : true,
            subtree       : true,
            characterData : true,
        });

        super.setElementOf("control", this.#element.querySelector(":scope > table > tfoot > tr > *"));
    }

    async #onThMutation(mutationList) {
        const headrow = this.#element.querySelector(":scope > table > thead > tr:nth-child(1)");
        const newcells = [];

        /* Get the list of new cells */
        for(const mutationRecord of mutationList) {
            const target = mutationRecord.target;

            if(target == headrow) {
                /* new head cell */
                for(const th of mutationRecord.addedNodes) {
                    if(!th.classList.contains("uskit-clickable") && (this.#opts.usersortable || this.#opts.userfilterable)) {
                        th.classList.add("uskit-clickable");
                        th.addEventListener("click", async (event) => event.target == th && await this.#onThClick(event));
                    }
                }
            }
        }
    }

    async #onTdMutation(mutationList) {
        const tbody = this.#element.querySelector(":scope > table > tbody");
        const newcells = []; const newrows = [];
        const remcells = []; const remrows = [];
        const updcells = []; const updrows = [];

        /* Get the list of new cells, removed rows */
        for(const mutationRecord of mutationList) {
            const target = mutationRecord.target;

            if(target == tbody) {
                for(const tr of mutationRecord.addedNodes) {
                    newrows.includes(tr) || newrows.push(tr);
                    tr.childNodes.forEach((td) => newcells.includes(td) || newcells.push(td));
                    if(!tr.getAttribute("data-uskit-rowseq")) tr.setAttribute("data-uskit-rowseq", ++this.#rowseq);
                }

                for(const tr of mutationRecord.removedNodes) {
                    remrows.includes(tr) || remrows.push(tr);
                    tr.childNodes.forEach((td) => remcells.includes(td) || remcells.push(td));
                }
            }
            else if(target.parentNode == tbody) {
                for(const td of mutationRecord.addedNodes) {
                    newcells.includes(td) || newcells.push(td);
                    newrows.includes(td.parentNode) || newrows.push(td.parentNode);
                }

                for(const td of mutationRecord.removedNodes) {
                    remcells.includes(td) || remcells.push(td);
                    remrows.includes(td.parentNode) || remrows.push(td.parentNode);
                }
            }
            else {
                let td = target;

                /* Travel up the node until we find tbody > tr > td */
                while(td.parentNode && td.parentNode.parentNode != tbody) td = td.parentNode;

                if(td.parentNode) {
                    updcells.includes(td) || updcells.push(td);
                    updrows.includes(td.parentNode) || updrows.push(td.parentNode);
                }
            }
        }

        /* Add listener to each new cell */
        for(const td of newcells) {
            if(!td.classList.contains("uskit-clickable")) {
                td.classList.add("uskit-clickable");
                td.addEventListener("click", async (event) => event.target == td && await this.#onTdClick(event));
            }
        }

        /* Resort if needed */
        for(const tr of newrows.concat(updrows)) {
            const trabove = tr.previousElementSibling;
            const trbelow = tr.nextElementSibling;
            const cmpabove = trabove ? this.#rowcmp(trabove, tr) : 0;
            const cmpbelow = trbelow ? this.#rowcmp(tr, trbelow) : 0;

            if(cmpabove > 0 || cmpbelow > 0) {
                await this.#resort();
                break;
            }
        }

        /* Notify listeners if any selected row was removed or updated */
        for(const tr of remrows.concat(updrows)) {
            if(tr.classList.contains("uskit-selected")) {
                await this.#onSelectionChange();
                break;
            }
        }
    }


    /*
    * Return the sort orders of two rows.
    *
    * @returns   0 if they have the same order.
    *           -1 if tr1 comes before tr2.
    *            1 if tr1 comes after tr2.
    */
    #rowcmp(tr1, tr2) {
        const headrow = this.#element.querySelector(":scope > table > thead > tr:nth-child(1)");
        const rowseq1 = tr1.getAttribute("data-uskit-rowseq");
        const rowseq2 = tr2.getAttribute("data-uskit-rowseq");
        const cmp = [];

        headrow.childNodes.forEach((th, i) => {
            const sort = th.getAttribute("data-uskit-sort");
            const seq = th.getAttribute("data-uskit-sort-seq");
            const v1 = this.#valueOf(tr1.childNodes[i]);
            const v2 = this.#valueOf(tr2.childNodes[i]);

            switch(sort) {
                case "asc"  : cmp[seq] = v1 < v2 ? -1 : v1 > v2 ? 1 : 0; break;
                case "desc" : cmp[seq] = v1 > v2 ? -1 : v2 < v1 ? 1 : 0; break;
            }
        });

        for(let i = 0; i < cmp.length; i++) {
            if(cmp[i]) return cmp[i];
        }

        return rowseq1 < rowseq2 ? -1 : rowseq1 > rowseq2 ? 1 : 0;
    }


    /**
    * Given a cell, return its value, properly typed.
    */
    #valueOf(td) {
        const th = this.#thOf(td);
        const type = th.getAttribute("data-uskit-coltype");
        let value = td.innerText;

        switch(type) {
            case "integer" : value = parseInt(value, 10) ; break;
            case "float"   : value = parseFloat(value)   ; break;
        }

        return value;
    }


    /**
    * Given a cell in TBODY, return the cell in THEAD from the same column.
    */
    #thOf(td) {
        const headrow = this.#element.querySelector(":scope > table > thead > tr:nth-child(1)");
        const tr = td.parentNode;
        const colnum = Array.from(tr.childNodes).indexOf(td);

        return headrow.childNodes[colnum];
    }

    #thAt(colnum) {
        const headrow = this.#element.querySelector(":scope > table > thead > tr:nth-child(1)");

        return headrow.childNodes[colnum];
    }

    #filterWidgetAt(colnum) {
        const colname = this.#colnameAt(colnum);

        return this.#filterWidgets[colname];
    }

    #colnameAt(colnum) {
        const th = this.#thAt(colnum);

        return th.getAttribute("data-uskit-colname");
    }

    #colnames() {
        const headrow = this.#element.querySelector(":scope > table > thead > tr:nth-child(1)");
        const colnames = [];

        headrow.childNodes.forEach((th) => {
            colnames.push(th.getAttribute("data-uskit-colname"));
        });

        return colnames;
    }

    /**
    * Given a cell in a TR, return the cell in previous TR from the same column.
    */
    #tdAbove(td) {
        const tr = td.parentNode;
        const colnum = Array.from(tr.childNodes).indexOf(td);
        const trabove = tr.previousElementSibling;

        return trabove ? trabove.childNodes[colnum] : null;
    }

    /**
    * Given a cell in a TR, return the cell in next TR from the same column.
    */
    #tdBelow(td) {
        const tr = td.parentNode;
        const colnum = Array.from(tr.childNodes).indexOf(td);
        const trbelow = tr.nextElementSibling;

        return trbelow ? trbelow.childNodes[colnum] : null;
    }

    /**
    * Sort rows when a header cell is clicked.
    */
    async #onThClick(event) {
        const th = event.target;
        const tr = th.parentNode;
        const modifiers = util.eventModifiers(event);
        const nextSortByNowSort = {
            null   : "asc",
            "asc"  : "desc",
            "desc" : null,
        }

        switch(modifiers) {
            case 0:
                if(this.#opts.usersortable) {
                    const nowSort = th.getAttribute("data-uskit-sort");
                    const nextSort = nextSortByNowSort[nowSort];

                    /* Clear all sort */
                    tr.querySelectorAll(":scope > *[data-uskit-sort]").forEach((th) => {
                        th.removeAttribute("data-uskit-sort")
                        th.removeAttribute("data-uskit-sort-seq")
                    });

                    /* Sort this column */
                    if(nextSort) {
                        th.setAttribute("data-uskit-sort", nextSort);
                        th.setAttribute("data-uskit-sort-seq", 1);
                    }

                    await this.#resort();
                }
                break;

            case util.EVENT_MOD_SHIFT:
                if(this.#opts.usersortable) {
                    const nowSort = th.getAttribute("data-uskit-sort");
                    const nowSeq = th.getAttribute("data-uskit-sort-seq");
                    const nextSort = nextSortByNowSort[nowSort];
                    let nextSeq = nowSeq ?? 0;

                    /* Calculate next sort */
                    if(nowSeq === null) {
                        tr.querySelectorAll(":scope > *[data-uskit-sort-seq]").forEach((th) => {
                            nextSeq = Math.max(nextSeq, th.getAttribute("data-uskit-sort-seq"))
                        });

                        nextSeq++;
                    }

                    /* Sort this column */
                    if(nextSort) {
                        th.setAttribute("data-uskit-sort", nextSort);
                        th.setAttribute("data-uskit-sort-seq", nextSeq);
                    }
                    else {
                        th.removeAttribute("data-uskit-sort");
                        th.removeAttribute("data-uskit-sort-seq");
                    }

                    await this.#resort();
                }
                break;

            case util.EVENT_MOD_CTRL:
                if(this.#opts.userfilterable) await this.#onFilterShow(th);
                break;
        }
    }

    async #onFilterShow(th) {
        const colname = th.getAttribute("data-uskit-colname");
        let filterWidget = this.#filterWidgets[colname];

        /* First time -> initialize */
        if(!filterWidget) {
            filterWidget = await filter_widget.createFilterWidget(th.innerText, {
                "target" : th,
            });

            filterWidget.addEventObserver("submit", async (event) => await this.#onFilter(event));
            this.#filterWidgets[colname] = filterWidget;
            super.addChildWidget(filterWidget);
        }

        await filterWidget.show();
    }

    async #onFilter(event) {
        const th = event.source.getTarget();
        const hasData = event.source.hasData("submit");

        if(hasData) th.setAttribute("data-uskit-filter", th.getAttribute("data-uskit-colname"));
        else th.removeAttribute("data-uskit-filter");

        await this.#refilter();
    }

    async #refilter() {
        const tbody = this.#element.querySelector(":scope > table > tbody");

        tbody.childNodes.forEach((tr) => {
            let isFiltered = true;

            for(let i = 0; i < tr.childNodes.length; i++) {
                const filterWidget = this.#filterWidgetAt(i);
                const td = tr.childNodes[i];

                if(filterWidget && !filterWidget.isMatch(this.#valueOf(td))) {
                    isFiltered = false;
                    break;
                }
            }

            tr.style.display = isFiltered ? "" : "none";
        });
    }

    async #resort() {
        const tbody = this.#element.querySelector(":scope > table > tbody");
        const rows = Array.from(tbody.childNodes);

        rows.sort((a,b) => this.#rowcmp(a,b)).forEach((tr) => {
            tbody.appendChild(tr);
        });
    }

    /**
    * Select row when a data cell is clicked.
    */
    async #onTdClick(event) {
        const td = event.target;
        const tr = td.parentNode;
        const tbody = tr.parentNode;
        const anchor = tbody.querySelector(":scope > tr.uskit-anchor");
        const allrows = tbody.querySelectorAll(":scope > tr");
        const selected = tbody.querySelectorAll(":scope > tr.uskit-selected");
        const modifiers = util.eventModifiers(event);

        switch(modifiers) {
            case 0:
                if(this.#opts.rowselect) {
                    selected.forEach((tr2) => tr2.classList.remove("uskit-selected"));
                    tr.classList.add("uskit-selected");

                    if(anchor) anchor.classList.remove("uskit-anchor");
                    tr.classList.add("uskit-anchor");

                    await this.#onSelectionChange();
                }
                break;

            case util.EVENT_MOD_CTRL:
                if(this.#opts.rowselect && this.#opts.multiselect) {
                    tr.classList.toggle("uskit-selected");

                    if(anchor) anchor.classList.remove("uskit-anchor");
                    tr.classList.add("uskit-anchor");

                    await this.#onSelectionChange();
                }
                break;

            case util.EVENT_MOD_SHIFT:
                if(this.#opts.rowselect && this.#opts.multiselect && anchor) {
                    let inside = false;

                    allrows.forEach((tr2) => {
                        if(tr2 == tr && tr2 == anchor) {
                            tr2.classList.add("uskit-selected");
                        }
                        else if(inside) {
                            tr2.classList.add("uskit-selected");
                            if(tr2 == tr || tr2 == anchor) inside = false;
                        }
                        else if(tr2 == tr || tr2 == anchor) {
                            tr2.classList.add("uskit-selected");
                            inside = true;
                        }
                        else {
                            tr2.classList.remove("uskit-selected");
                        }
                    });

                    await this.#onSelectionChange();
                }

                break;

            case util.EVENT_MOD_CTRL | util.EVENT_MOD_SHIFT:
                if(this.#opts.rowselect && this.#opts.multiselect && anchor) {
                    let inside = false;

                    allrows.forEach((tr2) => {
                        if(tr2 == tr && tr2 == anchor) {
                            tr2.classList.add("uskit-selected");
                        }
                        else if(inside) {
                            tr2.classList.add("uskit-selected");
                            if(tr2 == tr || tr2 == anchor) inside = false;
                        }
                        else if(tr2 == tr || tr2 == anchor) {
                            tr2.classList.add("uskit-selected");
                            inside = true;
                        }
                    });

                    await this.#onSelectionChange();
                }

                break;
        }
    }

    async #onSelectionChange() {
        await super.notifyEventObservers("select", {
            "type"    : "select",
            "source"  : this,
        });
    }

    async unselectAll() {
        let count = 0;

        this.#element.querySelectorAll(":scope > table > tbody > tr.uskit-anchor").forEach((tr) => {
            tr.classList.remove("uskit-anchor");
            count++;
        });

        this.#element.querySelectorAll(":scope > table > tbody > tr.uskit-selected").forEach((tr) => {
            tr.classList.remove("uskit-selected");
            count++;
        });

        if(count) await this.#onSelectionChange();
    }

    getSelected() {
        const selected = [];

        this.#element.querySelectorAll(":scope > table > tbody > tr.uskit-selected").forEach((tr) => {
            const row = {};

            tr.querySelectorAll(":scope > *").forEach((td, i) => {
                const colname = this.#colnameAt(i);
                const colvalue = td.innerText;

                row[colname] = colvalue;
            });

            selected.push(row);
        });

        return selected;
    }

    getData(channel) {
        let data = {};

        switch(channel) {
            case "selectfirst" : data = this.getSelected()[0] ?? {}; break;
            case "selectall"   : data = this.getSelected() ?? []   ; break;
            default:
                const dialogElement = this.getElementOf("control");

                dialogElement.querySelectorAll(`[data-uskit-${channel}]`).forEach((dataElement) => {
                    const name = dataElement.getAttribute(`data-uskit-${channel}`);
                    const value = dataElement.value;

                    data[name] = value;
                });
        }

        return data;
    }

    getElementOf(partName) {
        let element = null;

        switch(partName) {
            case "table" : element = super.getElementOf("container").querySelector("table[is='uskit-table']"); break;
            default      : element = super.getElementOf(partName); break;
        }

        return element;
    }

    setControl(htmlData) {
        super.setControl(htmlData);
        this.#onControlReady();
    }

    #onControlReady() {
        const controlElement = this.getElementOf("control");

        controlElement.querySelectorAll("[data-uskit-channel]").forEach((button) => {
            const channel = button.getAttribute("data-uskit-channel");

            controlElement.querySelectorAll(`[data-uskit-${channel}]`).forEach((input) => {
                input.addEventListener("keyup", async (event, ...args) => {
                    if(event.key == "Enter") {
                        this.disable(channel);
                        this.setStatus();

                        await this.notifyEventObservers(channel, {
                            "type"    : channel,
                            "source"  : this,
                            "content" : this.getData(channel),
                        });
                    }
                });
            });
        });
    }

    onAck(event) {
        this.enable(event.channel);
    }

    onNack(event) {
        this.enable(event.channel);
    }

    async reset() {
        const data = this.getData();

        this.#element.querySelectorAll(":scope > table > thead > tr").forEach((tr) => tr.innerHTML = "");
        this.#element.querySelectorAll(":scope > table > tbody").forEach((tbody) => tbody.innerHTML = "");

        /* Notify selection deletion */
        if(data) {
            await super.notifyEventObservers("select", {
                "type"   : "select",
                "source" : this,
            });
        }
    }

    async addColumn(colspec) {
        const tr = this.#element.querySelector(":scope > table > thead > tr");
        const th = document.createElement("th");

        th.innerText = colspec["title"];
        th.setAttribute("data-uskit-colname", colspec["name"]);
        th.setAttribute("data-uskit-coltype", colspec["type"]);

        /* Sort by this column */
        if(this.#opts.sortBy == colspec["name"]) {
            th.setAttribute("data-uskit-sort", this.#opts.sortDir);
            th.setAttribute("data-uskit-sort-seq", 1);
        }

        tr.appendChild(th);
    }

    async insertRow(rowid, row) {
        const tbody = this.#element.querySelector(":scope > table > tbody");
        const tr = document.createElement("tr");

        this.#colnames().forEach((colname) => {
            const td = document.createElement("td");

            td.innerText = row[colname];
            tr.appendChild(td);
        });

        tr.setAttribute("data-uskit-rowid", rowid);
        tr.classList.add("uskit-flash-in");
        tr.addEventListener("animationend", () => tr.classList.remove("uskit-flash-in"));
        tbody.appendChild(tr);
    }

    async updateRow(rowid, row) {
        const tbody = this.#element.querySelector(":scope > table > tbody");
        const tr = tbody.querySelector(`tr[data-uskit-rowid="${rowid}"]`);

        if(tr) {
            this.#colnames().forEach((colname, colnum) => {
                const td = tr.querySelector(`:scope > *:nth-child(${colnum+1})`);
                const oldText = td.innerText;
                const newText = row[colname];

                if(oldText != newText) {
                    td.innerText = newText;
                    td.classList.add("uskit-flash-in");
                    td.addEventListener("animationend", () => td.classList.remove("uskit-flash-in"));
                }
            });
        }
        else {
            await this.insertRow(rowid, row);
        }
    }

    async deleteRow(rowid) {
        const tbody = this.#element.querySelector(":scope > table > tbody");
        const tr = tbody.querySelector(`tr[data-uskit-rowid="${rowid}"]`);

        if(tr) {
            tr.classList.add("uskit-flash-out");
            tr.addEventListener("animationend", () => tr.remove());
        }
    }
}


/* ***************************************************************************
* FACTORY
*/

/**
* Create a new table widget.
*
* @param {string} [title]    Title of the table (unused).
* @param {object} [opts={}]  Options as name-value pairs.
* @returns {TableWidget}     Created table widget.
*/
export async function createTableWidget(title, opts={}) {
    const widget = await abstract_widget.createWidget(title, Object.assign({
        "cssUrl"       : "/ustatic/table_widget.css",
        "containerUrl" : "/ustatic/table_widget.html",
        "WidgetType"   : TableWidget,
    }, opts));

    return widget;
}

