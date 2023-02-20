import * as debug from "./debug.js";


/* ***************************************************************************
* EVENT MANAGER
*/

export class EventManager {
    #handlersByType = {};

    on(type, handler) {
        if(!(type in this.#handlersByType)) {
            this.#handlersByType[type] = [];
        }

        this.#handlersByType[type].push(handler);
    }

    off(type, handler) {
        if(type in this.#handlersByType) {
            const handlers = this.#handlersByType[type];
            const index = handlers.indexOf(handler);

            if(index >= 0) {
                handlers.remove(index);
            }
        }
    }

    trigger(event) {
        const type = event.type;
        let count = 0;

        /* Debug event */
        debug.event("trigger", event);

        /* Call all handlers of "*" event type */
        (this.#handlersByType["*"] || []).forEach((handler) => {
            handler(event);
            count++;
        });

        /* Call all handlers of "type" event type */
        (this.#handlersByType[type] || []).forEach((handler) => {
            handler(event);
            count++;
        });

        return count;
    }
}


/* ***************************************************************************
* FACTORY
*/

export function event_manager() {
    return new EventManager();
}

