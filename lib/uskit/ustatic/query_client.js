import * as abstract_client from "./abstract_client.js";


/* ***************************************************************************
* QUERY CLIENT
*/

export class QueryClient extends abstract_client.AbstractClient {
    constructor(parentClient, queryName, content={}) {   
        super(parentClient)

        this.queryName = queryName;
        this.parentClient = parentClient;
        this.content = content;

        this.parentClient.addEventObserver("open", async (event) => await this.#onSessionOpen(event));
        this.parentClient.addMessageObserver(`${this.queryName}_ACK`, async (message) => await this.#onQueryAck(message));
        this.parentClient.addMessageObserver(`${this.queryName}_NACK`, async (message) => await this.#onQueryNack(message));
        this.parentClient.addMessageObserver(`${this.queryName}_SNAPSHOT`, async (message) => await this.#onQueryReply(message));
        this.parentClient.addMessageObserver(`${this.queryName}_UPDATE`, async (message) => await this.#onQueryReply(message));

        if(this.parentClient.isOpen()) this.#onSessionOpen();
    }

    async #onSessionOpen() {
        await this.parentClient.send({
            "MESSAGE_TYPE" : `${this.queryName}`,
            "CONTENT"      : this.content,
        });
    }

    async #onQueryAck(message) {
        await super.notifyEventObservers("ack", {
            "type"       : "ack",
            "source"     : this,
            "channel"    : this.queryName,
            "message"    : message,
            "error_code" : message?.EXCEPTION?.ERROR_CODE,
            "error_text" : message?.EXCEPTION?.ERROR_TEXT,
        });

        await this.#onQueryReply(message);
    }

    async #onQueryNack(message) {
        await super.notifyEventObservers("nack", {
            "type"       : "nack",
            "source"     : this,
            "channel"    : this.queryName,
            "message"    : message,
            "error_code" : message?.EXCEPTION?.ERROR_CODE,
            "error_text" : message?.EXCEPTION?.ERROR_TEXT,
        });
    }

    async #onQueryReply(message) {
        const content = message.CONTENT || {};

        if(content.SCHEMA) {
            await super.notifyEventObservers("reset", {
                "type"    : "reset",
                "source"  : this,
                "channel" : this.queryName,
            });
        }

        for(const colspec of content.SCHEMA || []) {
            await super.notifyEventObservers("column", {
                "type"    : "column",
                "source"  : this,
                "channel" : this.queryName,
                "content" : colspec,
            });
        }

        for(const row of content.INSERT || []) {
            await super.notifyEventObservers("insert", {
                "type"    : "insert",
                "source"  : this,
                "channel" : this.queryName,
                "content" : row,
            });
        }

        for(const row of content.UPDATE || []) {
            await super.notifyEventObservers("update", {
                "type"    : "update",
                "source"  : this,
                "channel" : this.queryName,
                "content" : row,
            });
        }

        for(const row of content.DELETE || []) {
            await super.notifyEventObservers("delete", {
                "type"    : "delete",
                "source"  : this,
                "channel" : this.queryName,
                "content" : row,
            });
        }

        /* Request the next batch of data */
        if(content.IS_LAST === false) {
            this.parentClient.send({
                "MESSAGE_TYPE" : `${this.queryName}_NEXT`,
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
* @param   {AbstractClient} [parentClient]  Session over which to request and receive the query.
* @param   {string}         [queryName]     Query name.
* @returns {QueryClient}                    Created query client.
*/
export async function createQueryClient(...args) {
    return new QueryClient(...args);
}

