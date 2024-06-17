
const SQLQueryDistance = require('./dist/index');
const { Parser } = require('node-sql-parser');





( async () => {
let distance, steps, path; 
[distance, steps, path] = await SQLQueryDistance.parseAndCalculateDistance(process.argv[2], process.argv[3]);
//console.timeEnd();
console.log(SQLQueryDistance.stringifyDistance(distance, steps, path));
console.log(distance)
})()
