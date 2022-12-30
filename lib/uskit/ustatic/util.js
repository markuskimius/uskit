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

export async function loadCss(url) {
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
* TIMESTAMP
*/

export function nowstring() {
    const timestamp = new Date();
    const date = `${timestamp.getFullYear()}-${zeropad(timestamp.getMonth()+1,2)}-${zeropad(timestamp.getDate(),2)}`;
    const time = `${zeropad(timestamp.getHours(),2)}:${zeropad(timestamp.getMinutes(),2)}:${zeropad(timestamp.getSeconds(),2)}.${zeropad(timestamp.getMilliseconds(),3)}000`;
    const tzh = `${zeropad(-timestamp.getTimezoneOffset()/60, 2)}`;
    const tzm = `${zeropad(timestamp.getTimezoneOffset()%60, 2)}`;

    return `${date} ${time} ${tzh}${tzm}`;
}


export function epochstring() {
    return "0000-00-00 00:00:00.000000 +0000";
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


/* ***************************************************************************
* ZEROPAD
*/

export function zeropad(number, numdigits) {
    let string = Math.abs(number).toString();

    for(let i=string.length; i<numdigits; i++) {
        string = "0" + string;
    }

    return number < 0 ? `-${string}` : string;
}

