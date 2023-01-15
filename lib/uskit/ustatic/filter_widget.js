import * as util from "./util.js";
import * as debug from "./debug.js";
import * as abstract_widget from "./abstract_widget.js";


/* ***************************************************************************
* FILTER WIDGET
*/

export class FilterWidget extends abstract_widget.AbstractWidget {
    #opts = {};
    #target = null;
    #lastData = {};

    constructor(element, opts={}) {
        super(element);

        /* option defaults */
        this.#opts = Object.assign(this.#opts, opts);

        /* Save element */
        this.element = element;
        this.element.classList.add("uskit-filter");

        /* Save original style for later */
        this.original = {
            "width"  : element.style.width,
            "height" : element.style.height,
        };

        this.#onContentReady();
        this.#onControlReady();
    }

    getTarget() {
        return this.#opts.target;
    }

    setContent(htmlData) {
        super.setContent(htmlData);
        this.#onContentReady();
    }

    setControl(htmlData) {
        super.setControl(htmlData);
        this.#onControlReady();
    }

    #onContentReady() {
        const inputElements = this.getElementOf("content").querySelectorAll("[data-uskit-submit]");

        inputElements.forEach((input) => {
            input.addEventListener("keyup", async (event, ...args) => {
                if(event.key == "Enter") {
                    await super.notifyEventObservers("submit", {
                        "type"    : "submit",
                        "source"  : this,
                        "content" : this.getData("submit"),
                    });
                }
            });
        });

        inputElements.forEach((input) => {
            input.addEventListener("keyup", async (event, ...args) => {
                if(event.key == "Escape") {
                    await super.notifyEventObservers("cancel", {
                        "type"    : "cancel",
                        "source"  : this,
                    });
                }
            });
        });
    }

    #onControlReady() {
        super.addEventObserver("submit", async(event) => await this.#onSubmit(event));
        super.addEventObserver("cancel", async(event) => await this.#onCancel(event));
        super.addEventObserver("clear", async(event) => await this.#onClear(event));
    }

    async #onSubmit() {
        this.#lastData = this.getData("submit");
        this.hide();
    }

    async #onCancel() {
        this.setData(this.#lastData, "submit");  /* Restore data */
        this.hide();
    }

    async #onClear() {
        this.clearData("submit");
    }

    async hide() {
        await super.hide();
    }

    async show(channel="submit") {
        if(await super.show()) {
            const containerElement = this.getElementOf("container");

            /* Restore original size */
            containerElement.style.width = this.original.width;
            containerElement.style.height = this.original.height;

            /* Position the filter box 1/3 from bottom-right of the target object */
            if(this.#opts.target) {
                const targetRect = this.#opts.target.getBoundingClientRect();

                containerElement.style.top = `${window.scrollY + targetRect.top + targetRect.height}px`;
                containerElement.style.left = `${window.scrollX + targetRect.left + targetRect.width}px`;
            }

            this.focus(channel);
        }
    }

    focus(channel="submit") {
        const contentElement = this.getElementOf("content");
        const firstDataElement = contentElement.querySelector(`[data-uskit-${channel}]:not([hidden])`);

        /* Focus on the first element */
        firstDataElement?.focus();
    }

    clearData(channel="submit") {
        this.setData({}, channel);
    }

    setData(data, channel="submit") {
        const dialogElement = this.getElementOf("content");

        dialogElement.querySelectorAll(`[data-uskit-${channel}]`).forEach((dataElement) => {
            const name = dataElement.getAttribute(`data-uskit-${channel}`);

            dataElement.value = data[name] ?? "";
        });
    }

    getData(channel="submit") {
        const dialogElement = this.getElementOf("content");
        const data = {};

        dialogElement.querySelectorAll(`[data-uskit-${channel}]`).forEach((dataElement) => {
            const name = dataElement.getAttribute(`data-uskit-${channel}`);
            const value = dataElement.value;

            data[name] = value;
        });

        return data;
    }

    hasData(channel="submit") {
        const data = this.getData(channel);
        let hasData = false;

        for(const [name, filter] of Object.entries(data)) {
            if(name == "regex" && filter !== "") hasData = true;
            if(hasData) break;
        }

        return hasData;
    }

    isMatch(value, channel="submit") {
        const data = this.getData(channel);
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

export async function createFilterWidget(title, opts={}) {
    const widget = await abstract_widget.createWidget(title, Object.assign({
        "cssUrl"       : "/ustatic/filter_widget.css",
        "containerUrl" : "/ustatic/filter_widget.html",
        "WidgetType"   : FilterWidget,
    }, opts));

    return widget;
}

