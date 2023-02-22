import * as util from "./util.js";
import * as debug from "../debug.js";
import * as widget from "./widget.js";
import * as filter from "./filter.js";
import * as table_element from "./table_element.js";
import * as event_manager from "../event_manager.js";


/* ***************************************************************************
* TABLE WIDGET
*/

export class TableWidget extends widget.Widget {
    #rowseq = 0;
    #filterWidgets = {};
    #eventManager = event_manager.event_manager();
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

        const thObserver = new MutationObserver((mutationList) => this.#on_thchange(mutationList));
        const tdObserver = new MutationObserver((mutationList) => this.#on_tdchange(mutationList));
        const table = this.#opts.table ?? element.querySelector(":scope > table[is='uskit-table']");
        const thead = this.#opts.thead ?? table.querySelector(":scope > thead");
        const tbody = this.#opts.tbody ?? table.querySelector(":scope > tbody");
        const tfoot = this.#opts.tfoot ?? table.querySelector(":scope > tfoot");
        const headrow = this.#opts.headrow ?? thead.querySelector(":scope > tr:nth-child(1)");
        const control = this.#opts.control ?? tfoot.querySelector(":scope > tr:nth-child(1) > *");

        headrow && thObserver.observe(headrow, {
            childList     : true,
            subtree       : false,
            characterData : false,
        });

        tbody && tdObserver.observe(tbody, {
            childList     : true,
            subtree       : true,
            characterData : true,
        });

        super.on("control", (event) => this.#on_control())

        table && super.set("table", table);
        thead && super.set("thead", thead);
        tbody && super.set("tbody", tbody);
        tfoot && super.set("tfoot", tfoot);
        headrow && super.set("headrow", headrow);
        control && super.set("control", control);
    }

    on(type, handler) {
        this.#eventManager.on(type, handler);
        super.on(type, handler);
    }

    trigger(event) {
        switch(event.type) {
            case "ack"  : this.#on_ack(event); break;
            case "nack" : this.#on_nack(event); break;
            default     : super.trigger(event); break;
        }
    }

    #on_ack(event) {
        this.enable(event.channel);
    }

    #on_nack(event) {
        this.enable(event.channel);
    }

    unselectAll() {
        const tbody = this.get("tbody");
        let count = 0;

        tbody.querySelectorAll(":scope > tr.uskit-anchor").forEach((tr) => {
            tr.classList.remove("uskit-anchor");
            count++;
        });

        tbody.querySelectorAll(":scope > tr.uskit-selected").forEach((tr) => {
            tr.classList.remove("uskit-selected");
            count++;
        });

        if(count) this.#on_selection();
    }

    reset() {
        const headrow = this.get("headrow");
        const tbody = this.get("tbody");
        const selected = this.#get_selected();

        if(headrow) headrow.innerHTML = "";
        if(tbody) tbody.innerHTML = "";

        /* Notify selection deletion */
        if(selected) {
            this.#eventManager.trigger({
                "type"   : "select",
                "source" : this,
            });
        }
    }

    column(colspec) {
        const tr = this.get("headrow");
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

    insert(rowid, row) {
        const tbody = this.get("tbody");
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

    update(rowid, row) {
        const tbody = this.get("tbody");
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
            this.insertRow(rowid, row);
        }
    }

    delete(rowid) {
        const tbody = this.get("tbody");
        const tr = tbody.querySelector(`tr[data-uskit-rowid="${rowid}"]`);

        if(tr) {
            tr.classList.add("uskit-flash-out");
            tr.addEventListener("animationend", () => tr.remove());
        }
    }

    data(channel) {
        let data = {};

        switch(channel) {
            case "selectfirst" : data = this.#get_selected()[0] ?? {}; break;
            case "selectall"   : data = this.#get_selected() ?? []   ; break;
            default:
                const dialogElement = this.get("control");

                dialogElement.querySelectorAll(`[data-uskit-${channel}]`).forEach((dataElement) => {
                    const name = dataElement.getAttribute(`data-uskit-${channel}`);
                    const value = dataElement.value;

                    data[name] = value;
                });
        }

        return data;
    }

    #get_selected() {
        const selected = [];

        this.get("tbody").querySelectorAll(":scope > tr.uskit-selected").forEach((tr) => {
            const row = {};

            tr.querySelectorAll(":scope > *").forEach((td, i) => {
                const colname = this.#colname_at(i);
                const colvalue = td.innerText;

                row[colname] = colvalue;
            });

            selected.push(row);
        });

        return selected;
    }

    #on_control() {
        const controlElement = this.get("control");

        controlElement.querySelectorAll("[data-uskit-channel]").forEach((button) => {
            const channel = button.getAttribute("data-uskit-channel");

            controlElement.querySelectorAll(`[data-uskit-${channel}]`).forEach((input) => {
                input.addEventListener("keyup", (event, ...args) => {
                    if(event.key == "Enter") {
                        this.disable(channel);
                        this.set("status", "");

                        this.#eventManager.trigger({
                            "type"    : channel,
                            "source"  : this,
                            "content" : this.data(channel),
                        });
                    }
                });
            });
        });
    }

    /**
    * Add listeners to new header cells.
    */
    #on_thchange(mutationList) {
        const headrow = this.get("headrow");
        const newcells = [];

        /* Get the list of new cells */
        for(const mutationRecord of mutationList) {
            const target = mutationRecord.target;

            if(target == headrow) {
                /* new head cell */
                for(const th of mutationRecord.addedNodes) {
                    if(!th.classList.contains("uskit-clickable") && (this.#opts.usersortable || this.#opts.userfilterable)) {
                        th.classList.add("uskit-clickable");
                        th.addEventListener("mousedown", (event) => event.target == th && this.#on_thpress(event));
                    }
                }
            }
        }
    }

    /**
    * Add listeners to new data cells.
    */
    #on_tdchange(mutationList) {
        const tbody = this.get("tbody");
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
                td.addEventListener("mousedown", (event) => event.target == td && this.#on_tdpress(event));
            }
        }

        /* Resort if needed */
        for(const tr of newrows.concat(updrows)) {
            const trabove = tr.previousElementSibling;
            const trbelow = tr.nextElementSibling;
            const cmpabove = trabove ? this.#rowcmp(trabove, tr) : 0;
            const cmpbelow = trbelow ? this.#rowcmp(tr, trbelow) : 0;

            if(cmpabove > 0 || cmpbelow > 0) {
                this.#resort();
                break;
            }
        }

        /* Notify listeners if any selected row was removed or updated */
        for(const tr of remrows.concat(updrows)) {
            if(tr.classList.contains("uskit-selected")) {
                this.#on_selection();
                break;
            }
        }
    }

    /**
    * Sort rows when a mouse button is pressed over a header cell.
    */
    #on_thpress(event) {
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

                    this.#resort();
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

                    this.#resort();
                }
                break;

            case util.EVENT_MOD_CTRL:
                if(this.#opts.userfilterable) {
                    this.#on_filtershow(th);
                }
                break;
        }
    }

    /**
    * Given a cell in TBODY, return the cell in THEAD from the same column.
    */
    #th_of(td) {
        const headrow = this.get("headrow");
        const tr = td.parentNode;
        const colnum = Array.from(tr.childNodes).indexOf(td);

        return headrow.childNodes[colnum];
    }

    /**
    * Given a column number, return the TH.
    */
    #th_at(colnum) {
        const headrow = this.get("headrow");

        return headrow.childNodes[colnum];
    }

    #filter_widget_at(colnum) {
        const colname = this.#colname_at(colnum);

        return this.#filterWidgets[colname];
    }

    #colname_at(colnum) {
        const th = this.#th_at(colnum);

        return th.getAttribute("data-uskit-colname");
    }

    #colnames() {
        const headrow = this.get("headrow");
        const colnames = [];

        headrow.childNodes.forEach((th) => {
            colnames.push(th.getAttribute("data-uskit-colname"));
        });

        return colnames;
    }

    /**
    * Given a cell, return its value, properly typed.
    */
    #value_of(td) {
        const th = this.#th_of(td);
        const type = th.getAttribute("data-uskit-coltype");
        let value = td.innerText;

        switch(type) {
            case "integer" : value = parseInt(value, 10) ; break;
            case "float"   : value = parseFloat(value)   ; break;
        }

        return value;
    }

    async #on_filtershow(th) {
        const colname = th.getAttribute("data-uskit-colname");
        let filterWidget = this.#filterWidgets[colname];

        /* First time -> initialize */
        if(!filterWidget) {
            filterWidget = await filter.filter_widget(th.innerText, {
                "target" : th,
            });

            filterWidget.on("submit", (event) => this.#on_filter(event));
            this.#filterWidgets[colname] = filterWidget;
            super.add("content", filterWidget);
        }

        filterWidget.show();
    }

    #on_filter(event) {
        const hasData = event.source.isset("submit");
        const th = event.source.get("target");

        if(hasData) th.setAttribute("data-uskit-filter", th.getAttribute("data-uskit-colname"));
        else th.removeAttribute("data-uskit-filter");

        this.#refilter();
    }

    #refilter() {
        const tbody = this.get("tbody");

        tbody.childNodes.forEach((tr) => {
            let isFiltered = true;

            for(let i = 0; i < tr.childNodes.length; i++) {
                const filterWidget = this.#filter_widget_at(i);
                const td = tr.childNodes[i];

                if(filterWidget && !filterWidget.ismatch(this.#value_of(td))) {
                    isFiltered = false;
                    break;
                }
            }

            tr.style.display = isFiltered ? "" : "none";
        });
    }

    #resort() {
        const tbody = this.get("tbody");
        const rows = Array.from(tbody.childNodes);

        window.getSelection().empty();  /* Remove text selection */

        rows.sort((a,b) => this.#rowcmp(a,b)).forEach((tr) => {
            tbody.appendChild(tr);
        });
    }

    /*
    * Return the sort orders of two rows.
    *
    * @returns   0 if they have the same order.
    *           -1 if tr1 comes before tr2.
    *            1 if tr1 comes after tr2.
    */
    #rowcmp(tr1, tr2) {
        const headrow = this.get("headrow");
        const rowseq1 = tr1.getAttribute("data-uskit-rowseq");
        const rowseq2 = tr2.getAttribute("data-uskit-rowseq");
        const cmp = [];

        headrow.childNodes.forEach((th, i) => {
            const sort = th.getAttribute("data-uskit-sort");
            const seq = th.getAttribute("data-uskit-sort-seq");
            const v1 = this.#value_of(tr1.childNodes[i]);
            const v2 = this.#value_of(tr2.childNodes[i]);

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
    * Select row when the mouse button is pressed over a data cell.
    */
    #on_tdpress(event) {
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

                    this.#on_selection();
                }
                break;

            case util.EVENT_MOD_CTRL:
                if(this.#opts.rowselect && this.#opts.multiselect) {
                    tr.classList.toggle("uskit-selected");

                    if(anchor) anchor.classList.remove("uskit-anchor");
                    tr.classList.add("uskit-anchor");

                    this.#on_selection();
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

                    this.#on_selection();
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

                    this.#on_selection();
                }

                break;
        }
    }

    #on_selection() {
        window.getSelection().empty();  /* Remove text selection */

        this.#eventManager.trigger({
            "type"    : "select",
            "source"  : this,
        });
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
export async function table_widget(title, opts={}) {
    const ww = await widget.widget(title, Object.assign({
        "cssUrl"       : "/uskit/widget/table.css",
        "containerUrl" : "/uskit/widget/table.html",
        "WidgetType"   : TableWidget,
    }, opts));

    return ww;
}

