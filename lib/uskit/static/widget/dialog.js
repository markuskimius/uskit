import * as util from "./util.js";
import * as debug from "../debug.js";
import * as widget from "./widget.js";


/* ***************************************************************************
* DIALOG WIDGET
*/

export class DialogWidget extends widget.Widget {
    #opts = {};

    constructor(element, opts={}) {
        super(element, opts);

        /* option defaults */
        this.#opts = Object.assign(this.#opts, opts);
        this.#opts.motion ??= true;
        this.#opts.submit ??= true;
        this.#opts.cancel ??= true;

        element.classList.add("uskit-dialog");

        /* Save original style for later */
        super.set("width", element.style.width);
        super.set("height", element.style.height);

        /* Dialog box is movable by its titlebar */
        super.on("titlebar", (event) => this.#on_titlebar(event));
        super.on("content", (event) => this.#on_content(event));
        super.on("control", (event) => this.#on_control(event));
        super.on("show", (event) => this.#on_show(event));

        /* Show this widget only as needed */
        super.hide();
    }

    trigger(event) {
        switch(event.type) {
            case "ack"  : this.#on_ack(event); break;
            case "nack" : this.#on_nack(event); break;
            default     : super.trigger(event); break;
        }
    }

    #on_show(event) {
        const dialogElement = super.get("container");

        /* Restore original size */
        dialogElement.style.width = super.get("width");
        dialogElement.style.height = super.get("height");

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

        super.focus();
    }

    #on_titlebar(event) {
        if(this.#opts.motion) {
            const titlebar = super.get("titlebar");
            const container = super.get("container");
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
    }

    #on_content(event) {
        const content = super.get("content");
        const control = super.get("control");

        /* Initialize content if control is ready */
        if(content && control) this.#on_content_control(event);
    }

    #on_control(event) {
        const content = super.get("content");
        const control = super.get("control");
        const submitButton = control.querySelector("button[data-uskit-channel='submit']");
        const cancelButton = control.querySelector("button[data-uskit-channel='cancel']");

        super.on("submit", (event) => this.#on_submit(event));
        super.on("cancel", (event) => this.#on_cancel(event));

        if(!this.#opts.submit) submitButton.remove();
        if(!this.#opts.cancel) cancelButton.remove();

        /* Initialize content if it's ready */
        if(content && control) this.#on_content_control(event);
    }

    #on_content_control(event) {
        const inputElements = super.get("content").querySelectorAll("[data-uskit-submit]");
        const submitButton = super.get("control").querySelector("button[data-uskit-channel='submit']");
        const cancelButton = super.get("control").querySelector("button[data-uskit-channel='cancel']");

        if(this.#opts.submit) {
            inputElements.forEach((input) => {
                input.addEventListener("keyup", (event, ...args) => {
                    if(event.key == "Enter") {
                        submitButton.click();
                    }
                });
            });
        }

        if(this.#opts.cancel) {
            inputElements.forEach((input) => {
                input.addEventListener("keyup", (event, ...args) => {
                    if(event.key == "Escape") {
                        cancelButton.click();
                    }
                });
            });
        }
    }

    #on_submit() {
        super.disable("submit");
        super.set("status", "");
    }

    #on_cancel() {
        super.hide();
    }

    #on_ack(event) {
        super.enable("submit");
        super.set("status", "");

        super.hide();
    }

    #on_nack(event) {
        const code = event.error_code;
        const text = event.error_text;

        super.enable("submit");
        super.set("status", `[${code}] ${text}`);

        // super.show();
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
export async function dialog_widget(title, opts={}) {
    const ww = await widget.widget(title, Object.assign({
        "cssUrl"       : "/uskit/widget/dialog.css",
        "containerUrl" : "/uskit/widget/dialog.html",
        "WidgetType"   : DialogWidget,
    }, opts));

    return ww;
}

