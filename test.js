const SQLQueryDistance = require('./dist/index');
const { Parser } = require('node-sql-parser');




const destination_query = `SELECT [Asset], [Asset Type], [Operator],  [Field Size Category], [Field Type Category], [On-Offshore], [ReservoirDepthCategory], [Unconventional Category] FROM LLM.dbo.AssetCompany`
console.log(destination_query);
const query_with_less_conditions = undefined
// const complete_destination_query_ast = SQLQueryDistance.parseQuery(complete_destination_query);

const parser = new Parser();
let ast = parser.astify(destination_query, {database: 'transactsql'});
console.log(ast);
( async () => {
let distance, steps, path; 
console.log("WARNING: this might take a bit of time!"
    +" (for some reason, it's way faster in the browser)");
console.time();
[distance, steps, path] = await SQLQueryDistance.parseAndCalculateDistance(destination_query, query_with_less_conditions);
console.timeEnd();
console.log(SQLQueryDistance.stringifyDistance(distance, steps, path));
})()
