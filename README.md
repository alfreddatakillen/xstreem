XStreem
=======

Append-only local data store, for event streams and event sourcing.

All your events will be added to a log file (for persistent storage), as JSON blobs (one event/JSON blob per row).

Usage
-----

```
const XStreem = require('xstreem');
const eventstream = XStreem('./my-database-file');

// Add events:
eventstream.add({ action: 'goal', scorer: 'Lionel Messi', minute: 89 })
    .then(pos => {
        // pos is an incremental number/position representing your event.
    });

// Process all events (from position 0):
eventstream.listen(0, (pos, event) => {
    // pos = 0
    // events = { action: 'goal', scorer: 'Lionel Messi', minute: 89 }
});
```

The Node.js process will not exit before you remove your event listeners:

```
eventstream.removeAllListeners();
```

API
---

### `.add(eventobj)`

Where `eventobj` is any (JSON stringable) object that represents an event.

Returns a promise which resolves the event's position (Integer) in the event stream.

### `.listen(startPos, callbackFn)`

Where `startPos` is the event stream position to start listen from.

The `callbackFn` should be a function. It will be called like this:
`callbackFn(pos, eventobj)` where `eventobj` is the object representing an event,
and `pos` is that event's position in the event stream. 

Debugging
---------

Add a logging function as second argument to the class constructor, for debugging.

Example:

```
const XStreem = require('xstreem');
const eventstream = XStreem('./my-database-file', console.log);
```

Event sizes
-----------

Events should not be too large.
There is a hard limit of 1 megabyte (as JSON serialized object), which will make this module hang/crash/flip. :)

Changelog
---------

* `1.1.1` - Better clean up solution for temporary logs.
* `1.1.0` - Fixed the clean up of temporary log files on process exit.
* `1.0.0` - Initial version.
