import * as debug from "./debug.js";
import * as event_manager from "./event_manager.js";


/* ***************************************************************************
* QUERY CLIENT
*/

export class QueryClient {
    #session = null;
    #queryName = null;
    #queryContent = null;
    #eventManager = event_manager.event_manager();

    constructor(session, queryName, queryContent={}) {
        this.#session = session;
        this.#queryName = queryName;
        this.#queryContent = queryContent;

        this.#session.on("open", (event) => this.#on_open(event));
        this.#session.on(`${this.#queryName}_ACK`, (event) => this.#on_ack(event));
        this.#session.on(`${this.#queryName}_NACK`, (event) => this.#on_nack(event));
        this.#session.on(`${this.#queryName}_UPDATE`, (event) => this.#on_reply(event));
        this.#session.on(`${this.#queryName}_SNAPSHOT`, (event) => this.#on_reply(event));

        if(this.#session.isopen()) this.#on_open();
    }

    on(type, handler) {
        this.#eventManager.on(type, handler);
    }

    #on_open(event) {
        this.#session.send({
            "MESSAGE_TYPE" : this.#queryName,
            "CONTENT"      : this.#queryContent,
        });
    }

    #on_ack(event) {
        const message = event.message;

        this.#eventManager.trigger({
            "type"       : "ack",
            "source"     : this,
            "channel"    : this.#queryName,
            "message"    : message,
            "error_code" : message?.ERROR?.CODE,
            "error_text" : message?.ERROR?.TEXT,
        });

        this.#on_reply(event);
    }

    #on_nack(event) {
        const message = event.message;

        this.#eventManager.trigger({
            "type"       : "nack",
            "source"     : this,
            "channel"    : this.#queryName,
            "message"    : message,
            "error_code" : message?.ERROR?.CODE,
            "error_text" : message?.ERROR?.TEXT,
        });
    }

    #on_reply(event) {
        const message = event.message;
        const content = message.CONTENT || {};

        if(content.SCHEMA) {
            this.#eventManager.trigger({
                "type"    : "reset",
                "source"  : this,
                "channel" : this.#queryName,
            });
        }

        for(const colspec of content.SCHEMA || []) {
            this.#eventManager.trigger({
                "type"    : "column",
                "source"  : this,
                "channel" : this.#queryName,
                "content" : colspec,
            });
        }

        for(const row of content.INSERT || []) {
            this.#eventManager.trigger({
                "type"    : "insert",
                "source"  : this,
                "channel" : this.#queryName,
                "content" : row,
            });
        }

        for(const row of content.UPDATE || []) {
            this.#eventManager.trigger({
                "type"    : "update",
                "source"  : this,
                "channel" : this.#queryName,
                "content" : row,
            });
        }

        for(const row of content.DELETE || []) {
            this.#eventManager.trigger({
                "type"    : "delete",
                "source"  : this,
                "channel" : this.#queryName,
                "content" : row,
            });
        }

        /* Request the next batch of data */
        if(content.IS_LAST === false) {
            this.#session.send({
                "MESSAGE_TYPE" : `${this.#queryName}_NEXT`,
                "CONTENT"      : {
                    "QUERY_ID" : content.QUERY_ID,
                },
            });
        }
    }
}


/* ***************************************************************************
* FACTORY
*/

/**
* Create a query client.
*
* @param   {Session} [session]      Session over which to request and receive the query.
* @param   {string}  [queryName]    Query name.
* @returns {QueryClient}            Created query client.
*/
export function query_client(...args) {
    return new QueryClient(...args);
}

