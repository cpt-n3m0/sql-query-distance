import { MetaInfo, Query, Schema } from "./sql";
import { Edit, createDefaultConfig } from "./config";
import { clean, parseConfig, parseQuery, parseSchema, stringifyQuery } from "./parser";




let logging = false;
/**
 * Enables or disables logging of every generated neighbor node.
 *
 * @param l whether logging should be enabled or disabled
 */
export function enableLogging(l: boolean) {
    logging = l;
}


let canceled: boolean;
/**
 * Cancels the query distance calculation.
 */
export function cancelCalculateDistance() {
    canceled = true;
}


/**
 * A callback function for receiving updates on the distance calculation.
 *
 * @param distance the current search distance
 * @param maxDistance the maximum search distance
 * @param queryCount the current number of visited queries
 * @param queueLength the number of currently queued nodes
 */
export type UpdateListener =
    (distance: number, maxDistance: number, queryCount: number, queueLength: number) => void;
const updateListeners: UpdateListener[] = [];
/**
 * Adds a query-distance-update listener.
 *
 * @param l the update listener to add
 */
export function addUpdateListener(l: UpdateListener) {
    updateListeners.push(l);
}
/**
 * Removes a query-distance-update listener.
 *
 * @param l the update listener to remove
 */
export function removeUpdateListener(l: UpdateListener) {
    const i = updateListeners.indexOf(l);
    if(i>=0) updateListeners.splice(i, 1);
}
/**
 * Dispatches a query-distance-update.
 *
 * @param distance the current search distance
 * @param maxDistance the maximum search distance
 * @param queryCount the current number of visited queries
 * @param queueLength the number of currently queued nodes
 */
function dispatchUpdate(
    distance: number, maxDistance: number, queryCount: number, queueLength: number) {
    let stack = updateListeners.slice();
    for(let i=0; i<stack.length; ++i) stack[i](distance, maxDistance, queryCount, queueLength);
}








class Node {
    constructor(
        readonly query: Query,
        readonly distance: number,
        readonly previous: Node,
        readonly step: Edit,
        public nextEdit: number = 0,
    ) {}
};


/**
 * Calculates the distance (and shortest path) between two queries asynchronously.
 * It uses a custom shortest path algorithm based on uniform cost search.
 *
 * @param destination the destination query, required
 * @param start the start query, optional
 * @param schema the database schema, optional
 * @param config the configured set of edits, optional
 * @param maxDistance the maximum search distance, optional
 * @returns a promise for a tuple of the distance, edit-steps, and queries of the shortest path
 * @throws an error if the maximum search was exceeded before reaching the destination
 */

function removeKeysByValueRegex<T extends Map<string, any>>(obj: T, filter: string): Map<string, any>{
    let deletables: string[] = [];
    let filtered: Map<string, any> = new Map<string, any>(obj);
    for (const key of obj) {
        if (key[0].includes(filter)) {
            deletables.push(key[0])

        }
    }
    deletables.forEach(x => filtered.delete(x));
    return filtered;
}
function getPartEdits<T extends Map<string, any>>(obj: T, filter: string):  Map<string, any>{
    let deletables: string[] = [];
    let filtered: Map<string, any> = new Map<string, any>(obj);
    for (const key of obj) {
        if (!key[0].includes(filter)) {
            deletables.push(key[0])

        }
    }
    deletables.forEach(x => filtered.delete(x));
    return filtered;
}
enum parts {
    From,
    Select,
    Where,
    Orderby,
    Groupby
};
function partEquals(q1: Query, q2: Query, part: parts): boolean {

    let match = false;
    switch(part){
        case parts.Select: {
            match = q1.equalSelect(q2);
            break;
        }
        case parts.From: {
            match = q1.equalFrom(q2);
            break;
        }
        case parts.Where: {
            match = q1.equalWhere(q2);
            break;
        }
        case parts.Groupby: {
            match = q1.equalGroupby(q2);
            break;
        }
        case parts.Orderby: {
            match = q1.equalOrderby(q2);
            break;
        }
    }

    return match

}
export async function calculateDistance(
        destination: Query,
        start: Query = null,
        schema: Schema = null,
        config: Map<string, Edit> = null,
        maxDistance: number = Infinity)
        : Promise<[distance: number, steps: Edit[], path: Query[]]> {

    if(!destination) throw new Error("A destination is required to calculate the distance to.");
    if(!start) start = new Query();

    if(!schema) schema = Schema.deduceSchema(destination);

    // destination.validateSemantics(schema);

    const metaInfo = new MetaInfo(destination, schema);

    if(!config) config = createDefaultConfig();
    let num_parts = Object.keys(parts).length/2;
    let part_states = new Array(num_parts).fill(false);
    canceled = false;


    /* Uniform cost search,
     * but neighbors are generated exactly when they are the nearest unvisited node
     */

    //All discovered Nodes of the Graph
    const visited: Map<number, Node[]> = new Map();
    let queryCount: number = 1;
    //Queue of nodes to be processed next
    const queue: Map<number, Node[]> = new Map();
    let currentDistance: number = 0;

    //fire first update event to show that processing started
    dispatchUpdate(currentDistance, maxDistance, queryCount, 1);
    await new Promise(resolve => setTimeout(resolve, 0));

    //check if start and destination are already equal
    if(destination.equals(start)) return [0, [], [start]];

    let startNode: Node;
    //mark start node as visited and add its first neighbors to the queue
    // queue.set(currentDistance, [startNode]);
    let destinationNode: Node = new Node(destination, Infinity, null, null);
    //init update counter and timestamps
    let updateCounter: number = 0;
    let thisUpdate: number = Date.now(), previousUpdate: number = thisUpdate;

    //process queue of visited nodes ordered by smallest distance of their next unvisited neighbors
    partsLoop: for(let currentPart = 0; currentPart < num_parts; currentPart++){

        if (startNode == undefined)
            startNode = new Node(start, 0, null, null);
        visited.set(start.hash, [startNode]);
        const sortedConfig = Array.from(getPartEdits(config, Object(parts)[currentPart]).values()).sort((e1, e2) => e1.cost - e2.cost);
        const editCount = sortedConfig.length;
        const firstEditCost = sortedConfig[0].cost;
        if(!maxDistance && maxDistance !== 0) maxDistance = Infinity;
        currentDistance = startNode.distance + firstEditCost;
        queue.set(currentDistance, [startNode]);
        if (partEquals(startNode.query, destination, currentPart))
            continue;

        queueLoop: while(!canceled) {
            //while(!queue.has(currentDistance)) ++currentDistance;
            const currentQueue = queue.get(currentDistance);
            const node: Node = currentQueue.shift();
            const query: Query = node.query;
            const editNr: number = node.nextEdit;
            const edit: Edit = sortedConfig[editNr];
            if(currentDistance > maxDistance) { //max search distance exceeded
                throw new Error(`Destination could not be reached `+
                    `within the maximum distance of ${maxDistance}.`);
            }

            //for every neighbor generated by the edit
            const neighbors: Query[] = [];
            edit.perform(query, schema, metaInfo, neighbors);
            //  if (edit.name.includes('Asterisk')){

            // console.log(stringifyQuery(query));
            // console.log('Destination: ',stringifyQuery( destinationNode.query));
            // console.log('-------------------------------------');
            // neighbors.forEach(x => console.log(stringifyQuery(x)));
            // console.log('-------------------------------------');
            // } */
            // }
            neighborLoop: for(let n=0, nl=neighbors.length; n<nl; ++n) {
                const neighbor: Query = neighbors[n];
                //skip this neighbor if it has already been visited
                const comparableNodes: Node[] = visited.get(neighbor.hash) || [];
                for(let cn=0, cnl=comparableNodes.length; cn<cnl; ++cn) {
                    const comparableQuery = comparableNodes[cn].query;
                    if(neighbor.equals(comparableQuery))
                        continue neighborLoop;
                }

                //end the search if the destination has been reached
                if(destination.equals(neighbor)) {
                    //override destination to make alias names etc. consistent
                    destinationNode = new Node(neighbor, currentDistance, node, edit);
                    break partsLoop;
                }
                //mark this neighbor as visited
                ++queryCount;
                const neighborNode = new Node(neighbor, currentDistance, node, edit);

                if (partEquals(neighbor, destination, currentPart))
                {

                    startNode = neighborNode;
                    //console.log(Object(parts)[currentPart], ' match complete: ', stringifyQuery(query));
                    break queueLoop;
                }
                if(logging) console.log(neighborNode);
                if(!visited.has(neighbor.hash)) visited.set(neighbor.hash, []);
                visited.get(neighbor.hash).push(neighborNode);
                //and queue it at the proper position
                const nextDistance: number = currentDistance + firstEditCost;
                if(!queue.has(nextDistance)) queue.set(nextDistance, []);
                queue.get(nextDistance).push(neighborNode);
            }

            ++node.nextEdit;
            if(node.nextEdit < editCount) {
                //if there are edits left, that have not been performed on the query yet, re-queue node
                const nextDistance = node.distance + sortedConfig[node.nextEdit].cost;
                if(!queue.has(nextDistance)) queue.set(nextDistance, []);
                queue.get(nextDistance).push(node);
            }

            const currentDistanceChanges: boolean = currentQueue.length == 0;
            if(currentDistanceChanges) { //if this was the last node with the current distance
                queue.delete(currentDistance);
                if(queue.size == 0) { //when using all atomic edits, this should not be possible
                    throw new Error("Destination query could not be reached"+
                        " regardless of distance. This should not be possible,"+
                        " except if some atomic edits are missing from the config.");
                }
                ++currentDistance;
                while(!queue.has(currentDistance)) ++currentDistance;
            }

            //fire update events (and avoid massive freezing, especially in browser)
            if(currentDistanceChanges ||
                ((++updateCounter > 10000) && ((thisUpdate = Date.now()) - previousUpdate) > 1000)) {
                updateCounter = 0;
                previousUpdate = thisUpdate;
                dispatchUpdate(currentDistance, maxDistance, queryCount,
                    currentDistanceChanges ? queue.get(currentDistance).length : currentQueue.length);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }


    if(canceled) {
        throw new Error("The distance calculation was canceled"+
            " before the destination could be reached.");
    }


    if(logging) console.log(destinationNode);
    //gather steps and path from destination node back to start node
    let node: Node = destinationNode;
    const steps: Edit[] = [];
    const path: Query[] = [];
    path.unshift(node.query);
    while(node.previous) {
        steps.unshift(node.step);
        node = node.previous;
        path.unshift(node.query);
    }
    return [destinationNode.distance, steps, path];
}


/**
 * Parses the descriptions of and calculates the distance (and shortest path) between two queries asynchronously.
 * It passes the parsed arguements to [[`calculateDistance`]].
 *
 * @param destination the description of the destination query, required
 * @param start the description of the start query, optional
 * @param schema the description of the database schema, optional
 * @param config the description of the configured set of edits, optional
 * @param maxDistance the maximum search distance, optional
 * @returns a promise for a tuple of the distance, edit-steps, and queries of the shortest path
 * @throws an error if the maximum search was exceeded before reaching the destination
 */
export async function parseAndCalculateDistance(
        destinationDescription: string,
        startDescription: string = null,
        schemaDescription: string = null,
        configDescription: string = null,
        maxDistance: number = Infinity)
        : Promise<[distance: number, steps: Edit[], path: Query[]]> {

    let destination = parseQuery(destinationDescription);
    let start = startDescription && clean(startDescription) != ""
        ? parseQuery(startDescription)
        : new Query();
    let schema = schemaDescription && clean(schemaDescription) != ""
        ? parseSchema(schemaDescription)
        : null;
    let config = configDescription && clean(configDescription) != ""
        ? parseConfig(configDescription)
        : createDefaultConfig();
    return calculateDistance(destination, start, schema, config, maxDistance);
}
