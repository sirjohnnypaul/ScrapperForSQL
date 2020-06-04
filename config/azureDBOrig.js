
// Create connection to database
const config = {
    authentication: {
    options: {
        userName: "azuresuperserver", // update me
        password: "OAcces5283gilhf!&@%90ycgut1234" // update me
    },
    type: "default"
    },
    server: "azuresuperserver.database.windows.net", // update me
    options: {
    database: "superazureserverDB", //update me
    encrypt: true
    }
};
    
const configSQL = {
    user: "azuresuperserver",
    password: "OAcces5283gilhf!&@%90ycgut1234",
    server: "azuresuperserver.database.windows.net", 
    database: "superazureserverDB", 
    port: 1433
};

module.exports =
{
    configAzureDb: config,
    configAzureDbSimple: configSQL
};
