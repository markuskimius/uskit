import * as util from "./util.js";
import * as debug from "./debug.js";
import * as observable from "./observable.js";


/* ***************************************************************************
* ABSTRACT WIDGET
*/

export class AbstractWidget extends observable.Observable {
    #elements = {};
    #initial = {};
    #status = {};

    constructor(element, opts={}) {
        super();

        /* Get the parts of this widget before children are added */
        this.#elements = {
            "container" : element,
            "title"     : element.querySelector("uskit-title"),
            "content"   : element.querySelector("uskit-content"),
            "control"   : element.querySelector("uskit-control"),
            "status"    : element.querySelector("uskit-status"),
        };

        /* Remember the initial state before manipulating */
        this.#initial = {
            "display"   : element.style.display,
        };

        /* Widget status */
        this.#status = {
            "code"      : null,
            "text"      : null,
        };

        this.#elements.control && this.#onControlReady();
        this.hide();
    }

    getElementOf(partName) {
        return this.#elements[partName];
    }

    setElementOf(partName, element) {
        this.#elements[partName] = element;
    }

    getTitle() {
        return this.getElementOf("title")?.innerText;
    }

    setTitle(title) {
        const titleElement = this.getElementOf("title");

        if(titleElement) {
            titleElement.innerText = title;
        }

        return titleElement ? true : false;
    }

    getContent() {
        return this.getElementOf("content");
    }

    setContent(htmlData) {
        const contentElement = this.getElementOf("content");

        if(contentElement) {
            contentElement.innerHTML = htmlData;
        }

        return contentElement ? true : false;
    }

    getControl() {
        return this.getElementOf("control");
    }

    setControl(htmlData) {
        const controlElement = this.getElementOf("control");

        if(controlElement) {
            controlElement.innerHTML = htmlData;
            this.#onControlReady();
        }

        return controlElement ? true : false;
    }

    #onControlReady() {
        const controlElement = this.getElementOf("control");

        /* Add a click listener to all buttons with channels */
        controlElement.querySelectorAll("[data-uskit-channel]").forEach((button) => {
            const channel = button.getAttribute("data-uskit-channel");

            button.addEventListener("click", async (event) => {
                await super.notifyEventObservers(channel, {
                    "type"    : channel,
                    "source"  : this,
                    "content" : this.getData(channel),
                });
            });
        });
    }

    getStatusCode() {
        return this.#status["code"];
    }

    getStatusText() {
        return this.#status["text"];
    }

    setStatus(text=null, code=null) {
        const statusElement = this.getElementOf("status");

        this.#status["code"] = code;
        this.#status["text"] = text;

        if(text && code) text = `[${code}] ${text}`;
        else if(code)    text = `[${code}]`;
        else if(text)    text = `${text}`;
        else             text = "";

        if(statusElement) {
            statusElement.innerText = text;
            statusElement.title = text;      /* tooltip */

            if(code) statusElement.classList.add("uskit-error");
            else     statusElement.classList.remove("uskit-error");
        }

        return statusElement ? true : false;
    }

    addChildWidget(childWidget) {
        const contentElement = this.getElementOf("content");

        if(contentElement) {
            const childElement = childWidget.getElementOf("container");

            contentElement.appendChild(childElement);
        }

        return contentElement ? true : false;
    }

    enable(channel) {
        const containerElement = this.getElementOf("container");

        containerElement.querySelectorAll(`[data-uskit-${channel}], [data-uskit-channel="${channel}"]`).forEach((element) => {
            element.disabled = false;
        });
    }

    disable(channel) {
        const containerElement = this.getElementOf("container");

        containerElement.querySelectorAll(`[data-uskit-${channel}], [data-uskit-channel="${channel}"]`).forEach((element) => {
            element.disabled = true;
        });
    }

    async show() {
        const containerElement = this.getElementOf("container");

        if(containerElement.style.display == "none") {
            const originalDisplay = this.#initial["display"];

            containerElement.style.display = originalDisplay;

            await super.notifyEventObservers("show", {
                "type"   : "show",
                "source" : this,
            });

            return true;
        }

        return false;
    }

    async hide() {
        const containerElement = this.getElementOf("container");

        if(containerElement.style.display != "none") {
            containerElement.style.display = "none";

            await super.notifyEventObservers("hide", {
                "type"   : "hide",
                "source" : this,
            });
        }
    }

    getData(channel) {
        debug.debug(`${this.constructor.name}.${this.name}(): Unimplemented method:`, channel);
    }
}


/* ***************************************************************************
* FACTORY
*/

export async function createWidget(title, opts={}) {
    const cssUrl           = opts.cssUrl       ?? null;
    const controlUrl       = opts.controlUrl   ?? null;
    const contentUrl       = opts.contentUrl   ?? null;
    const containerUrl     = opts.containerUrl ?? null;
    const controlHtml      = opts.controlHtml  ?? (controlUrl   && await util.fetchData(controlUrl));
    const contentHtml      = opts.contentHtml  ?? (contentUrl   && await util.fetchData(contentUrl));
    const containerElement = opts.container    ?? (containerUrl && await util.fetchElement(containerUrl, "uskit-widget"));
    const WidgetType       = opts.WidgetType   ?? AbstractWidget;
    const widget           = new WidgetType(containerElement, opts);

    util.loadCss("/ustatic/abstract_widget.css");

    title       && widget.setTitle(title);
    contentHtml && widget.setContent(contentHtml);
    controlHtml && widget.setControl(controlHtml);
    cssUrl      && util.loadCss(cssUrl);

    return widget;
}

