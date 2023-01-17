import * as util from "./util.js";
import * as debug from "./debug.js";
import * as abstract_widget from "./abstract_widget.js";


/* ***************************************************************************
* DIALOG WIDGET
*/

export class DialogWidget extends abstract_widget.AbstractWidget {
    constructor(element, opts={}) {
        super(element);

        /* option defaults */
        this.opts = Object.assign({}, opts);
        this.opts.motion ??= true;
        this.opts.submit ??= true;
        this.opts.cancel ??= true;

        /* Save element */
        this.element = element;
        this.element.classList.add("uskit-dialog");

        /* Save original style for later */
        this.original = {
            "width"  : element.style.width,
            "height" : element.style.height,
        };

        /* Dialog box is movable by its titlebar */
        if(this.opts.motion) {
            const titlebar = this.getElementOf("title");
            const container = this.getElementOf("container");
            let ondown = false;

            titlebar.addEventListener("mousedown", (event) => ondown = true);
            container.addEventListener("mouseup", (event) => ondown = false);
            container.addEventListener("mouseleave", (event) => ondown = false);
            container.addEventListener("mousemove", (event) => {
                if(ondown) {
                    const bb = container.getBoundingClientRect();

                    container.style.top = `${bb.top + event.movementY}px`;
                    container.style.left = `${bb.left + event.movementX}px`;
                }
            });
        }

        this.#onContentReady();
        this.#onControlReady();
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

        if(this.opts.submit) {
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
        }

        if(this.opts.cancel) {
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
    }

    #onControlReady() {
        const submitButton = this.getElementOf("control").querySelector("button[data-uskit-channel='submit']");
        const cancelButton = this.getElementOf("control").querySelector("button[data-uskit-channel='cancel']");

        super.addEventObserver("submit", async(event) => await this.#onSubmit(event));
        super.addEventObserver("cancel", async(event) => await this.#onCancel(event));

        if(!this.opts.submit) submitButton.remove();
        if(!this.opts.cancel) cancelButton.remove();
    }

    async #onSubmit() {
        this.disable("submit");
        this.setStatus();
    }

    async #onCancel() {
        this.hide();
    }

    async hide() {
        await super.hide();
    }

    async show(channel="submit") {
        if(await super.show()) {
            const dialogElement = this.getElementOf("container");

            /* Restore original size */
            dialogElement.style.width = this.original.width;
            dialogElement.style.height = this.original.height;

            /*
            * Center.  This needs to be done after displaying the dialog box
            * because otherwise the dialog box hasn't been rendered so we can't
            * get its dimension for centering.
            */
            const bb = dialogElement.getBoundingClientRect();
            const bw = bb.width;
            const bh = bb.height;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            dialogElement.style.top = `${(vh-bh)/2}px`;
            dialogElement.style.left = `${(vw-bw)/2}px`;

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

    async onAck(event) {
        this.enable("submit");
        this.setStatus();

        await this.hide();
    }

    async onNack(event) {
        this.enable("submit");
        this.setStatus(event.error_text, event.error_code);

        // await this.show();
    }
}


/* ***************************************************************************
* FACTORY
*/

/**
* Create a new dialog widget.
*
* @param {string} [title]    Title of the dialog.
* @param {object} [opts={}]  Options as name-value pairs.
* @returns {DialogWidget}     Created dialog widget.
*/
export async function createDialogWidget(title, opts={}) {
    const widget = await abstract_widget.createWidget(title, Object.assign({
        "cssUrl"       : "/ustatic/dialog_widget.css",
        "containerUrl" : "/ustatic/dialog_widget.html",
        "WidgetType"   : DialogWidget,
    }, opts));

    return widget;
}

