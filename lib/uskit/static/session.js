import * as util from "./util.js";
import * as debug from "./debug.js";
import * as abstract_client from "./abstract_client.js";


/* ***************************************************************************
* SESSION
*/

export class Session extends abstract_client.AbstractClient {
    static messageId = 0;

    constructor() {
        super(null);

        this.websocket = null;
    }

    isOpen() {
        return this.websocket && this.websocket.readyState == WebSocket.OPEN;
    }

    async open(url) {
        /*
        * url is interpreted as follows:
        *
        *   - `url` if url is an absolute URL.
        *   - `ws://<location>/url` if url is a relative path and <location> is HTTP.
        *   - `wss://<location>/url` if url is a relative path and <location> is HTTPS.
        *
        * ... where <location> is the URL of the webserver that is serving this
        * Javascript code, less the protocol part.
        */
        const fullurl = new URL(url, `${location.protocol == "http:" ? "ws" : "wss"}://${location.host}/${location.pathname}`).href

        this.url = url;
        this.websocket = new WebSocket(fullurl);

        this.websocket.addEventListener("open", async (event) => await this.#onOpen(event));
        this.websocket.addEventListener("close", async (event) => await this.#onClose(event));
        this.websocket.addEventListener("message", async (event) => await this.#onMessage(event));
    }

    async #onOpen(event) {
        debug.info("socket open");

        await this.notifyEventObservers("open", {
            "type"   : "open",
            "source" : this,
        });
    }

    async #onClose(event) {
        debug.info("socket closed");

        await this.notifyEventObservers("close", {
            "type"   : "close",
            "source" : this,
        });

        /* Reconnect if disconnected unexpectedly */
        if(this.url) setTimeout(() => this.open(this.url), 1000);
    }

    async #onMessage(event) {
        const data = event.data;

        try {
            const message = JSON.parse(data);

            debug.socket("RX:", message);

            await this.notifyMessageObservers(message);
        }
        catch(e) {
            if(e instanceof SyntaxError) {
                debug.error("RX BAD:", e, data);
            }
            else {
                throw e;
            }
        }
    }

    async close() {
        if(this.websocket) {
            this.url = null;         /* Do not attempt to reconnect */
            this.websocket.close();  /* Close session */
            this.websocket = null;
        }
    }

    async send(message) {
        const messageCopy = Object.assign({
            "MESSAGE_ID" : Session.messageId++,
            "TIMESTAMP"  : util.nowstring(),
        }, message);

        debug.socket("TX:", messageCopy);
        this.websocket.send(JSON.stringify(messageCopy));

        return messageCopy;
    }
}


/* ***************************************************************************
* FACTORY
*/

/**
* Create a session.
*
* @returns {Session}  New session.
*/
export async function createSession(...args) {
    return new Session(...args);
}

