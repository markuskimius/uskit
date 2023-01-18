import * as debug from "./debug.js";
import * as abstract_client from "./abstract_client.js";


/* ***************************************************************************
* TXN CLIENT
*/

export class TxnClient extends abstract_client.AbstractClient {
    constructor(parentClient, txnName) {   
        super(parentClient);

        this.txnName = txnName;
        this.parentClient = parentClient;
        this.lastMessageId = 0;

        this.parentClient.addMessageObserver(`${this.txnName}_ACK`, async (message) => await this.#onTxnAck(message));
        this.parentClient.addMessageObserver(`${this.txnName}_NACK`, async (message) => await this.#onTxnNack(message));
        this.parentClient.addMessageObserver("NACK", async (message) => await this.#onNack(message));
    }

    async send(content) {
        const sent = await this.parentClient.send({
            "MESSAGE_TYPE" : this.txnName,
            "CONTENT"      : content,
        });

        this.lastMessageId = sent.MESSAGE_ID;

        return sent;
    }

    async onSubmit(event, ...args) {
        await this.send(event.content);
    }

    async #onTxnAck(message) {
        await super.notifyEventObservers("ack", {
            "type"       : "ack",
            "source"     : this,
            "message"    : message,
            "error_code" : message?.EXCEPTION?.ERROR_CODE,
            "error_text" : message?.EXCEPTION?.ERROR_TEXT,
        });
    }

    async #onTxnNack(message) {
        await super.notifyEventObservers("nack", {
            "type"       : "nack",
            "source"     : this,
            "message"    : message,
            "error_code" : message?.EXCEPTION?.ERROR_CODE,
            "error_text" : message?.EXCEPTION?.ERROR_TEXT,
        });
    }

    async #onNack(message) {
        /*
        * Reroute generic NACK to {txnName}_NACK only if it's a NACK of a
        * message we sent previously.
        */
        if(message.REPLY_TO_ID === this.lastMessageId) {
            await this.#onTxnNack(message);
        }
    }
}


/* ***************************************************************************
* FACTORY
*/

/**
* Create a transaction client.
*
* @param   {AbstractClient} [parentClient]  Session over which to send the transaction.
* @param   {string}         [txnName]       Transaction name.
* @returns {TxnClient}                      Created query client.
*/
export async function createTxnClient(...args) {
    return new TxnClient(...args);
}

