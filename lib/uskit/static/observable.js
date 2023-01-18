/* ***************************************************************************
* OBSERVABLE
*/

export class Observable {
    #observersByEventType = {};

    addEventObserver(eventType, observer) {
        if(!(eventType in this.#observersByEventType)) {
            this.#observersByEventType[eventType] = [];
        }

        this.#observersByEventType[eventType].push(observer);
    }

    async notifyEventObservers(eventType, event) {
        const promises = [];

        /* Call all observers of "*" event type */
        (this.#observersByEventType["*"] || []).forEach((observer) => {
            promises.push(observer(event));
        });

        /* Call all observers of "eventType" event type */
        (this.#observersByEventType[eventType] || []).forEach((observer) => {
            promises.push(observer(event));
        });

        /* Wait */
        await Promise.all(promises);

        return promises.length;
    }
}

