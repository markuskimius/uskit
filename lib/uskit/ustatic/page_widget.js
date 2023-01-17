import * as util from "./util.js";
import * as abstract_widget from "./abstract_widget.js";


/* ***************************************************************************
* PAGE WIDGET
*/

export class PageWidget extends abstract_widget.AbstractWidget {
    constructor(element, opts={}) {
        super(element, opts);

        element.classList.add("uskit-page");

        super.show();
    }
}


/* ***************************************************************************
* FACTORY
*/

/**
* Create a new page widget.
*
* @param {string} [title]    Title of the page.
* @param {object} [opts={}]  Options as name-value pairs.
* @returns {PageWidget}      Created page widget.
*/
export async function createPageWidget(title, opts={}) {
    const widget = await abstract_widget.createWidget(title, Object.assign({
        "cssUrl"       : "/ustatic/page_widget.css",
        "containerUrl" : "/ustatic/page_widget.html",
        "WidgetType"   : PageWidget,
    }, opts));

    /* Append widget to the body */
    document.querySelectorAll("body").forEach((body) => {
        const element = widget.getElementOf("container");

        body.appendChild(element);
    });

    return widget;
}

