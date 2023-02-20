/* ***************************************************************************
* FETCH ELEMENT
*/

export async function fetchElement(url, containerElementType="div") {
    const element = document.createElement(containerElementType);
    const html = await fetchData(url);

    element.innerHTML = html;

    return element;
}


/* ***************************************************************************
* FETCH DATA
*/

export async function fetchData(url) {
    const response = await fetch(url);
    const text = await response.text();

    return text;
}


/* ***************************************************************************
* FETCH JSON
*/

export async function fetchJson(url) {
    const response = await fetch(url);
    const json = await response.json();

    return json;
}


/* ***************************************************************************
* LOAD CSS
*/

const loadedCssByUrl = {};

export function loadCss(url) {
    if(!(url in loadedCssByUrl)) {
        const head = document.querySelector("head");
        const link = document.createElement("link");

        link.rel = "stylesheet";
        link.href = url;

        head.appendChild(link);
        loadedCssByUrl[url] = true;
    }
}


/* ***************************************************************************
* EVENTS
*/

export const EVENT_MOD_SHIFT = 0x01;
export const EVENT_MOD_CTRL  = 0x02;
export const EVENT_MOD_CMD   = 0x02;  /* CMD key on macOS is treated same as CTRL on PC */
export const EVENT_MOD_ALT   = 0x04;


export function eventModifiers(event) {
    let downkeys = 0;

    if(event.shiftKey) downkeys |= EVENT_MOD_SHIFT;
    if(event.ctrlKey)  downkeys |= EVENT_MOD_CTRL;
    if(event.metaKey)  downkeys |= EVENT_MOD_CMD;
    if(event.altKey)   downkeys |= EVENT_MOD_ALT;

    return downkeys;
}

