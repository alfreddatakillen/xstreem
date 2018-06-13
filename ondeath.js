const death = require('death');

const callbacks = [];

function onExit() {
    for (callback of callbacks) {
        callback();
    }
    process.exit();
}

process.on('exit', onExit);

module.exports = cb => {
    callbacks.push(cb);
};