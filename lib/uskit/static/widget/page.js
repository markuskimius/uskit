import * as util from "./util.js";
import * as widget from "./widget.js";


/* ***************************************************************************
* PAGE WIDGET
*/

export class PageWidget extends widget.Widget {
    constructor(element, opts={}) {
        super(element, opts);

        element.classList.add("uskit-page");
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
export async function page_widget(title, opts={}) {
    const ww = await widget.widget(title, Object.assign({
        "cssUrl"       : "/uskit/widget/page.css",
        "containerUrl" : "/uskit/widget/page.html",
        "WidgetType"   : PageWidget,
    }, opts));

    /* Append widget to the body */
    document.querySelectorAll("body").forEach((body) => {
        const element = ww.get("container");

        body.appendChild(element);
    });

    return ww;
}

