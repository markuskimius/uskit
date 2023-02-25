import * as debug from "./debug.js";
import * as event_manager from "./event_manager.js";


/* ***************************************************************************
* TXN CLIENT
*/

export class TxnClient {
    #session = null;
    #txnName = null;
    #eventManager = event_manager.event_manager();

    constructor(session, txnName) {   
        this.#session = session;
        this.#txnName = txnName;

        this.#session.on(`${this.#txnName}_ACK`, (event) => this.#on_ack(event));
        this.#session.on(`${this.#txnName}_NACK`, (event) => this.#on_nack(event));
    }

    on(type, handler) {
        this.#eventManager.on(type, handler);
    }

    trigger(event) {
        switch(event.type) {
            case "submit" : this.#on_submit(event); break;
            default       : debug.debug("Unhandled event", event); break;
        }
    }

    send(content) {
        const sent = this.#session.send({
            "MESSAGE_TYPE" : this.#txnName,
            "CONTENT"      : content,
        });

        return sent;
    }

    #on_ack(event) {
        const message = event.message;

        this.#eventManager.trigger({
            "type"       : "ack",
            "source"     : this,
            "message"    : message,
            "error_code" : message?.ERROR?.CODE,
            "error_text" : message?.ERROR?.TEXT,
        });
    }

    #on_nack(event) {
        const message = event.message;

        this.#eventManager.trigger({
            "type"       : "nack",
            "source"     : this,
            "message"    : message,
            "error_code" : message?.ERROR?.CODE,
            "error_text" : message?.ERROR?.TEXT,
        });
    }

    #on_submit(event) {
        this.send(event.content);
    }
}


/* ***************************************************************************
* FACTORY
*/

/**
* Create a transaction client.
*
* @param   {Session} [session]      Session over which to send the transaction.
* @param   {string}  [txnName]      Transaction name.
* @returns {TxnClient}              Created query client.
*/
export function txn_client(...args) {
    return new TxnClient(...args);
}

