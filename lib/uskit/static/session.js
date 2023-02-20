import * as util from "./util.js";
import * as debug from "./debug.js";
import * as event_manager from "./event_manager.js";


/* ***************************************************************************
* SESSION
*/

export class Session {
    static #messageId = 0;

    #url = null;
    #websocket = null;
    #reconnectMs = 1000;
    #eventManager = event_manager.event_manager();

    constructor(opts={}) {
        this.#reconnectMs = opts["reconnect-ms"] ?? this.#reconnectMs;
    }

    on(type, handler) {
        this.#eventManager.on(type, handler);
    }

    isopen() {
        return this.#websocket && this.#websocket.readyState == WebSocket.OPEN;
    }

    /**
    * Open a session.
    * `url` is interpreted as follows:
    *
    *   - `url` if url is an absolute URL.
    *   - `ws://<location>/url` if url is a relative path and <location> is HTTP.
    *   - `wss://<location>/url` if url is a relative path and <location> is HTTPS.
    *
    * ... where <location> is the URL of the webserver that is serving this
    * Javascript code, less the protocol part.
    */
    open(url) {
        const fullurl = new URL(url, `${location.protocol == "http:" ? "ws" : "wss"}://${location.host}/${location.pathname}`).href

        this.close();
        this.#url = url;
        this.#websocket = new WebSocket(fullurl);

        this.#websocket.addEventListener("open", (event) => this.#open_handler(event));
        this.#websocket.addEventListener("close", (event) => this.#close_handler(event));
        this.#websocket.addEventListener("message", (event) => this.#message_handler(event));
    }

    close() {
        if(this.#websocket) {
            this.#url = null;         /* Do not attempt to reconnect */
            this.#websocket.close();  /* Close session */
            this.#websocket = null;
        }
    }

    send(message) {
        const messageCopy = {
            ...message,
            "MESSAGE_ID" : Session.#messageId++,
            "TIMESTAMP"  : util.nowstring(),
        };

        debug.socket("TX:", messageCopy);
        this.#websocket.send(JSON.stringify(messageCopy));

        return messageCopy;
    }

    #open_handler(event) {
        debug.info("socket open");

        this.#eventManager.trigger({
            "type"    : "open",
            "session" : this,
        });
    }

    #close_handler(event) {
        debug.info("socket closed");

        this.#eventManager.trigger({
            "type"    : "close",
            "session" : this,
        });

        /* Reconnect if disconnected unexpectedly */
        if(this.#url) setTimeout(() => this.open(this.#url), this.#reconnectMs);
    }

    #message_handler(event) {
        const data = event.data;

        try {
            const message = JSON.parse(data);

            debug.socket("RX:", message);

            this.#eventManager.trigger({
                "type"    : message.MESSAGE_TYPE,
                "message" : message,
            });
        }
        catch(e) {
            switch(true) {
                case e instanceof SyntaxError : debug.error("RX BAD:", e, data); break;
                default                       : throw e; break;
            }
        }
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
export function session(opts={}) {
    return new Session(opts);
}

