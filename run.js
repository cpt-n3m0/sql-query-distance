
const SQLQueryDistance = require('./dist/index');
const { Parser } = require('node-sql-parser');




let destination_query = (process.argv[2] == '') ? undefined: process.argv[2] ;
let start_query = (process.argv[3] == '') ? undefined: process.argv[3]; 
//if (destination_query == undefined){ 
    //let output = {"distance": 0, "worst_distance": 0, "steps": undefined}
    //console.log(output)
    //process.exit(0)
//}


( async () => {
let distance, steps, worst_distance; 
[distance, steps , ] = await SQLQueryDistance.parseAndCalculateDistance(destination_query, start_query);
[worst_distance, , ] = await SQLQueryDistance.parseAndCalculateDistance(destination_query, undefined);
let output = {"distance": distance, "worst_distance": worst_distance, "steps": steps}
console.log(JSON.stringify(output))
})()
