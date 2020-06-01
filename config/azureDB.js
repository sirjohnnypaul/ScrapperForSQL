
// Create connection to database
const config = {
    authentication: {
    options: {
        userName: "", // update me
        password: "" // update me
    },
    type: "default"
    },
    server: "", // update me
    options: {
    database: "", //update me
    encrypt: true
    }
};
    
const configSQL = {
    user: "",
    password: "",
    server: "", 
    database: "", 
    port: 1433
};

module.exports =
{
    configAzureDb: config,
    configAzureDbSimple: configSQL
};
