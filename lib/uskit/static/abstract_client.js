import * as observable from "./observable.js";


/* ***************************************************************************
* ABSTRACT CLIENT
*/

export class AbstractClient extends observable.Observable {
    #parentClient = null;

    constructor(parentClient) {
        super();

        this.#parentClient = parentClient;
    }

    isOpen() {
        return this.#parentClient.isOpen();
    }

    addMessageObserver(messageType, observer) {
        super.addEventObserver(`message|${messageType}`, observer);
    }

    async notifyMessageObservers(message) {
        const messageType = message.MESSAGE_TYPE;
        let count = 0;

        count += await super.notifyEventObservers(`message|*`, message);
        count += await super.notifyEventObservers(`message|${messageType}`, message);

        return count;
    }

    async send(message) {
        return await this.#parentClient.send(message);
    }
}

