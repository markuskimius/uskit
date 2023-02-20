import * as util from "./util.js";
import * as debug from "../debug.js";
import * as event_manager from "../event_manager.js";


/* ***************************************************************************
* WIDGET
*/

export class Widget {
    #partByName = {};
    #eventManager = event_manager.event_manager();

    constructor(element, opts={}) {
        this.#eventManager.on("title", (event) => this.#on_title(event));
        this.#eventManager.on("status", (event) => this.#on_status(event));
        this.#eventManager.on("control", (event) => this.#on_control(event));

        this.set("container", element);
    }

    on(type, handler) {
        this.#eventManager.on(type, handler);
    }

    trigger(event) {
        debug.debug("Unhandled event", event);
    }

    get(partName) {
        return this.#partByName[partName];
    }

    set(partName, part) {
        this.#partByName[partName] = part;

        this.#eventManager.trigger({
            "type"   : partName,
            "widget" : this,
            "part"   : part,
        });
    }

    setText(partName, text) {
        this.get(partName).innerText = text;
    }

    setHtml(partName, html) {
        this.get(partName).innerHtml = html;
    }

    add(partName, child) {
        const parentElement = this.get(partName);
        let childElement = null;

        /* Populate childElement based on child type */
        switch(true) {
            case child instanceof Widget : childElement = child.get("container"); break;
            case child instanceof Node   : childElement = child; break;
            default:
                childElement = document.createElement("div");
                childElement.innerHTML = child;
                break;
        }

        /* Append childElement to parentElement */
        if(parentElement) {
            parentElement.appendChild(childElement);

            this.#eventManager.trigger({
                "type"   : partName,
                "widget" : this,
                "part"   : childElement,
            });
        }

        return parentElement ? true : false;
    }

    #on_title(event) {
        const titlebar = this.get("titlebar");

        if(titlebar) {
            titlebar.innerText = event.part;
        }
    }

    #on_status(event) {
        const statusbar = this.get("statusbar");

        if(statusbar) {
            statusbar.innerText = event.part;
        }
    }

    #on_control(event) {
        const element = event.part;

        /* Add a click listener to all buttons with channels */
        element.querySelectorAll("[data-uskit-channel]").forEach((button) => {
            const channel = button.getAttribute("data-uskit-channel");

            button.addEventListener("click", (event) => {
                this.#eventManager.trigger({
                    "type"    : channel,
                    "source"  : this,
                    "content" : this.data(channel),
                });
            });
        });
    }

    clear(channel="submit") {
        this.data(channel, {});
    }

    data(channel="submit", setvalues=null) {
        const element = this.get("content");
        const data = {};

        element.querySelectorAll(`[data-uskit-${channel}]`).forEach((element) => {
            const name = element.getAttribute(`data-uskit-${channel}`);

            data[name] = element.value;

            if(setvalues !== null) {
                element.value = setvalues[name] ?? "";
            }
        });

        return data;
    }

    focus(channel="submit") {
        const contentElement = this.get("content");
        const firstDataElement = contentElement.querySelector(`[data-uskit-${channel}]:not([hidden])`);

        /* Focus on the first element */
        firstDataElement?.focus();
    }

    enable(channel="submit") {
        const container = this.get("container");

        container.querySelectorAll(`[data-uskit-${channel}], [data-uskit-channel="${channel}"]`).forEach((element) => {
            element.disabled = false;

            this.#eventManager.trigger({
                "type"    : "enable",
                "source"  : this,
                "channel" : channel,
            });
        });
    }

    disable(channel="submit") {
        const container = this.get("container");

        container.querySelectorAll(`[data-uskit-${channel}], [data-uskit-channel="${channel}"]`).forEach((element) => {
            element.disabled = true;

            this.#eventManager.trigger({
                "type"    : "disable",
                "source"  : this,
                "channel" : channel,
            });
        });
    }

    show() {
        const element = this.get("container");
        const display = this.get("display");

        if(element.style.display === "none") {
            element.style.display = display;

            this.#eventManager.trigger({
                "type"   : "show",
                "source" : this,
            });
        }
    }

    hide() {
        const element = this.get("container");

        if(element.style.display !== "none") {
            this.set("display", element.style.display);
            element.style.display = "none";

            this.#eventManager.trigger({
                "type"   : "hide",
                "source" : this,
            });
        }
    }
}


/* ***************************************************************************
* FACTORY
*/

export async function widget(title, opts={}) {
    const cssUrl           = opts.cssUrl       ?? null;
    const containerUrl     = opts.containerUrl ?? null;
    const containerElement = opts.container    ?? (containerUrl && await util.fetchElement(containerUrl, "uskit-widget"));
    const contentUrl       = opts.contentUrl   ?? null;
    const contentHtml      = opts.contentHtml  ?? (contentUrl   && await util.fetchData(contentUrl));
    const controlUrl       = opts.controlUrl   ?? null;
    const controlHtml      = opts.controlHtml  ?? (controlUrl   && await util.fetchData(controlUrl));
    const WidgetType       = opts.WidgetType   ?? Widget;
    const widget           = new WidgetType(containerElement, opts);

    util.loadCss("/uskit/widget/widget.css");

    containerElement.querySelectorAll("uskit-title").forEach((titleElement) => widget.set("titlebar", titleElement));
    containerElement.querySelectorAll("uskit-content").forEach((contentElement) => widget.set("content", contentElement));
    containerElement.querySelectorAll("uskit-control").forEach((controlElement) => widget.set("control", controlElement));
    containerElement.querySelectorAll("uskit-status").forEach((statusElement) => widget.set("statusbar", statusElement));

    title       && widget.set("title", title);
    contentHtml && widget.add("content", contentHtml);
    controlHtml && widget.add("control", controlHtml);
    cssUrl      && util.loadCss(cssUrl);

    return widget;
}

