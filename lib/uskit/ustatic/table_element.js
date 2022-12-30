/* ***************************************************************************
* TABLE ELEMENT
*/

class TableElement extends HTMLTableElement {
    /* Intentionally left blank */
}


/* ***************************************************************************
* REGISTRATION
*/

customElements.define("uskit-table", TableElement, { extends: "table" });

