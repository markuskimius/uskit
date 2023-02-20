import * as util from "./util.js";
import * as debug from "../debug.js";
import * as widget from "./widget.js";
import * as event_manager from "../event_manager.js";


/* ***************************************************************************
* FILTER WIDGET
*/

export class FilterWidget extends widget.Widget {
    #opts = {};
    #lastData = {};
    #eventManager = event_manager.event_manager();

    constructor(element, opts={}) {
        super(element, opts);

        /* option defaults */
        this.#opts = Object.assign(this.#opts, opts);

        element.classList.add("uskit-filter");

        /* Save original style for later */
        super.set("width", element.style.width);
        super.set("height", element.style.height);

        super.on("content", (event) => this.#on_content());
        super.on("submit", (event) => this.#on_submit());
        super.on("cancel", (event) => this.#on_cancel());
        super.on("clear", (event) => this.#on_clear());
        super.on("show", (event) => this.#on_show());

        if(super.get("content")) this.#on_content();

        /* Show this widget only as needed */
        super.hide();
    }

    on(type, handler) {
        switch(type) {
            case "submit" : /* Pass-through */
            case "cancel" : /* Pass-through */
            case "clear"  : this.#eventManager.on(type, handler); break;
            default       : super.on(type, handler); break;
        }
    }

    #on_content() {
        const inputElements = super.get("content").querySelectorAll("[data-uskit-submit]");

        inputElements.forEach((input) => {
            input.addEventListener("keyup", (event, ...args) => {
                if(event.key == "Enter") this.#on_submit();
            });
        });

        inputElements.forEach((input) => {
            input.addEventListener("keyup", (event, ...args) => {
                if(event.key == "Escape") this.#on_cancel();
            });
        });
    }

    #on_submit() {
        this.#lastData = super.data("submit");
        super.hide();

        this.#eventManager.trigger({
            "type"    : "submit",
            "source"  : this,
            "content" : super.data("submit"),
        });
    }

    #on_cancel() {
        super.data("submit", this.#lastData);  /* Restore data */
        super.hide();

        this.#eventManager.trigger({
            "type"    : "cancel",
            "source"  : this,
        });
    }

    #on_clear() {
        super.clear("submit");

        this.#eventManager.trigger({
            "type"    : "clear",
            "source"  : this,
        });
    }

    #on_show() {
        const containerElement = super.get("container");
        const target = super.get("target");
        const width = super.get("width");
        const height = super.get("height");

        /* Restore original size */
        containerElement.style.width = width;
        containerElement.style.height = height;

        /* Position the filter box 1/3 from bottom-right of the target object */
        if(target) {
            const targetRect = target.getBoundingClientRect();

            containerElement.style.top = `${window.scrollY + targetRect.top + targetRect.height}px`;
            containerElement.style.left = `${window.scrollX + targetRect.left + targetRect.width}px`;
        }

        super.focus();
    }

    isset(channel="submit") {
        const data = super.data(channel);
        let hasData = false;

        for(const [name, filter] of Object.entries(data)) {
            if(name == "regex" && filter !== "") hasData = true;
            if(hasData) break;
        }

        return hasData;
    }

    ismatch(value, channel="submit") {
        const data = super.data(channel);
        let isMatch = true;

        for(const [name, filter] of Object.entries(data)) {
            if(name == "regex" && filter !== "") {
                const re = new RegExp(filter);

                if(!value.match(re)) {
                    isMatch = false;
                    break;
                }
            }
        }

        return isMatch;
    }
}


/* ***************************************************************************
* FACTORY
*/

export async function filter_widget(title, opts={}) {
    const target = opts.target ?? null;
    const ww = await widget.widget(title, Object.assign({
        "cssUrl"       : "/uskit/widget/filter.css",
        "containerUrl" : "/uskit/widget/filter.html",
        "WidgetType"   : FilterWidget,
    }, opts));

    target && ww.set("target", target);

    return ww;
}

