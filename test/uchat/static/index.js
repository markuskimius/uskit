import * as uskit from "/uskit/index.js";
import * as debug from "/uskit/debug.js";


/* ***************************************************************************
* MAIN
*/

async function main() {
    const session = await uskit.createSession();
    const loginSession = new LoginSession(session);

    /* Clients */
    const loginTxnClient = await uskit.createTxnClient(session, "LOGIN");
    const addUserTxnClient = await uskit.createTxnClient(loginSession, "TXN_USER_ADD");
    const editUserTxnClient = await uskit.createTxnClient(loginSession, "TXN_USER_EDIT");
    const deleteUserTxnClient = await uskit.createTxnClient(loginSession, "TXN_USER_DELETE");
    const chatTxnClient = await uskit.createTxnClient(loginSession, "TXN_CHAT");
    const userQueryClient = await uskit.createQueryClient(loginSession, "QUERY_USER");
    const chatQueryClient = await uskit.createQueryClient(loginSession, "QUERY_CHAT");

    /* Widgets */
    const pageWidget = await uskit.createPageWidget("UChat");
    const loginDialogWidget = await uskit.createDialogWidget("Sign In", { "contentUrl" : "./dialog-login.html", "cancel" : false });
    const userTableWidget = await uskit.createTableWidget("User", { "controlUrl" : "./control-user.html", "sortBy" : "f_USER_ID" });
    const chatTableWidget = await uskit.createTableWidget("Chat", { "controlUrl" : "./control-chat.html", "rowselect" : false, "usersortable" : false, "userfilterable" : false, "sortBy" : "f_TIMESTAMP", "sortDir" : "asc" });
    const addUserDialogWidget = await uskit.createDialogWidget("Add User", { "contentUrl" : "./dialog-adduser.html" });
    const editUserDialogWidget = await uskit.createDialogWidget("Edit User", { "contentUrl" : "./dialog-edituser.html" });
    const deleteUserDialogWidget = await uskit.createDialogWidget("Delete User", { "contentUrl" : "./dialog-deleteuser.html" });

    /* Page layout */
    pageWidget.addChildWidget(loginDialogWidget);
    pageWidget.addChildWidget(userTableWidget);
    pageWidget.addChildWidget(chatTableWidget);
    pageWidget.addChildWidget(addUserDialogWidget);
    pageWidget.addChildWidget(editUserDialogWidget);
    pageWidget.addChildWidget(deleteUserDialogWidget);

    /* Table layout */
    userTableWidget.getElementOf("table").style.maxHeight = "30em";
    chatTableWidget.getElementOf("table").style.maxHeight = "30em";

    /* Connectors */
    uskit.connectQueryToTable(userQueryClient, userTableWidget);
    uskit.connectQueryToTable(chatQueryClient, chatTableWidget);
    uskit.connectWidgetToTxn(loginDialogWidget, loginSession, "submit");
    uskit.connectWidgetToTxn(loginSession, loginTxnClient, "submit");
    uskit.connectWidgetToTxn(chatTableWidget, chatTxnClient, "submit");
    uskit.connectWidgetToTxn(addUserDialogWidget, addUserTxnClient, "submit");
    uskit.connectWidgetToTxn(editUserDialogWidget, editUserTxnClient, "submit");
    uskit.connectWidgetToTxn(deleteUserDialogWidget, deleteUserTxnClient, "submit", () => {
        const data = [];

        userTableWidget.getData("selectall").forEach((row) => {
            data.push({
                "USER_ID" : Number(row.f_USER_ID),
            });
        });

        return data;
    });

    /* Page events */
    session.addEventObserver("open", async () => await pageWidget.setStatus("Connected."));
    session.addEventObserver("close", async () => await pageWidget.setStatus("Disconnected.", "UCON"));
    loginSession.addEventObserver("open", async () => await pageWidget.setStatus("Logged in."));

    /* Table events */
    userTableWidget.addEventObserver("add", async () => await addUserDialogWidget.show());
    userTableWidget.addEventObserver("edit", async () => await editUserDialogWidget.show());
    userTableWidget.addEventObserver("delete", async () => await deleteUserDialogWidget.show());

    /* Txn events */
    chatTxnClient.addEventObserver("ack", async () => {
        const tableElement = chatTableWidget.getElementOf("table");
        const inputElement = chatTableWidget.getElementOf("control").querySelector("input");

        tableElement.scrollTo(0, tableElement.scrollHeight);

        inputElement.value = "";
    });

    /* Dialog setup */
    addUserDialogWidget.addEventObserver("show", async () => addUserDialogWidget.clearData());
    editUserDialogWidget.addEventObserver("show", async () => editUserDialogWidget.setData(userTableWidget.getData("selectfirst"), "table"));
    deleteUserDialogWidget.addEventObserver("show", async () => {
        const selections = userTableWidget.getData("selectall");

        if(selections.length == 1) deleteUserDialogWidget.setContent(`Delete ${selections[0]["f_USER_NAME"]}?`);
        else                       deleteUserDialogWidget.setContent(`Delete ${selections.length} users?`);
    });

    /* Widget visibility */
    loginTxnClient.addEventObserver("ack",  async () => await loginDialogWidget.hide());
    loginTxnClient.addEventObserver("nack", async () => await loginDialogWidget.show());
    userQueryClient.addEventObserver("ack",  async () => await userTableWidget.show());
    userQueryClient.addEventObserver("nack",  async () => await userTableWidget.hide());
    chatQueryClient.addEventObserver("ack",  async () => await chatTableWidget.show());
    chatQueryClient.addEventObserver("nack",  async () => await chatTableWidget.hide());
    pageWidget.show();

    /* Button enable/disable */
    userTableWidget.addEventObserver("select", async (event) => userTableWidget.getData("selectall").length == 1 ? userTableWidget.enable("edit") : userTableWidget.disable("edit"));
    userTableWidget.addEventObserver("select", async (event) => userTableWidget.getData("selectall").length >= 1 ? userTableWidget.enable("delete") : userTableWidget.disable("delete"));
    userTableWidget.disable("edit");
    userTableWidget.disable("delete");

    /* Connect to the server */
    await loginDialogWidget.show();
    await session.open("/uchat");
}


/**
* LOGIN SESSION
*
* Login manager intercepts messages between the login dialog and login txn
* then, if the session disconnects then reconnects, auto re-logs into the
* server.
*/
class LoginSession extends uskit.AbstractClient {
    constructor(parentClient) {
        super(parentClient);

        this.parentClient = parentClient;
        this.last_open = null;
        this.last_submit = null;

        this.parentClient.addEventObserver("open", async (event) => await this.#onOpen(event));
    }

    addEventObserver(eventType, observer) {
        switch(eventType) {
            case "ack"    : /* pass through */
            case "nack"   : /* pass through */
            case "open"   : /* pass through */
            case "submit" : super.addEventObserver(eventType, observer); break;
            default       : this.parentClient.addEventObserver(eventType, observer);
        }
    }

    addMessageObserver(messageType, observer) {
        this.parentClient.addMessageObserver(messageType, observer);
    }

    async #onOpen(event) {
        this.last_open = event;

        /* Re-login */
        if(this.last_submit) {
            await super.notifyEventObservers(this.last_submit.type, this.last_submit);
        }
    }

    async onSubmit(event) {
        this.last_submit = event;

        await super.notifyEventObservers(event.type, event);
    }

    async onAck(event) {
        await super.notifyEventObservers(event.type, event);

        /* Login accepted; session is now open */
        await super.notifyEventObservers("open", Object.assign({}, event, {
            "type" : "open",
        }));
    }

    async onNack(event) {
        /* Login rejected; credential is bad */
        this.credentials = null;

        await super.notifyEventObservers(event.type, event);
    }
}


/* ***************************************************************************
* BOOTSTRAP
*/

main();

