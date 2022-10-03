class DialogFlow {
    constructor(state_map, init_state) {
        this.state_map = state_map;
        this.init_state = init_state;
        this.flows = {};
    }
    create(context) {
        let flow_id = Math.random().toString(16).slice(-10);
        while(this.flows.hasOwnProperty(flow_id))
            flow_id = Math.random().toString(16).slice(-10);

        this.flows[flow_id] = {
            active: false,
            queued_contexts: [ context ],
            state: this.init_state
        };

        this.#executeFlow(flow_id);

        return flow_id;
    }
    continue(flow_id, context) {
        this.flows[flow_id].queued_contexts.push(context);
        if(!this.flows[flow_id].active)
            this.#executeFlow(flow_id);
    }

    async #executeFlow(flow_id) {
        this.flows[flow_id].active = true;
        let context, last_add_context = {};
        while(context = this.flows[flow_id].queued_contexts.pop()) {
            while(true) {
                // console.log("> Moving from", this.flows[flow_id].state, context);
                const [ new_state, get_new_context, add_context = {} ] =
                    await this.state_map[this.flows[flow_id].state](
                        Object.assign(context, last_add_context)
                    );
                this.flows[flow_id].state = new_state;
                last_add_context = add_context;
                // console.log("> Moving to", this.flows[flow_id].state, context);
                if(get_new_context) break;
            }
        }
        this.flows[flow_id].active = false;
    }
}

module.exports = exports = DialogFlow;