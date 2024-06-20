
const SQLQueryDistance = require('./dist/index');
const { Parser } = require('node-sql-parser');






( async () => {
let distance, steps, path; 
[distance, steps , ] = await SQLQueryDistance.parseAndCalculateDistance(process.argv[2], process.argv[3]);
[worst_distance, , ] = await SQLQueryDistance.parseAndCalculateDistance(process.argv[2], undefined);
let output = {"distance": distance, "worst_distance": worst_distance, "steps": steps}
console.log(JSON.stringify(output))
})()
