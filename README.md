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

### `.add(eventobj, options)`

Where `eventobj` is any (JSON stringable) object that represents an event.

`options` is an object with options. Available options are:

* `resolvePosition` defaults to `true`. Set to false if you do want the event's position as resolved result.

Returns a promise which resolves on successful write to the filesystem.

If the `resolvePosition` option is `true` (which is default), the position of the new event is returned on resolve.
Note, that resolving the position is slower and requires more resources, so whenever you do not need the the position,
you should run `.add()` with the `resolvePosition` option set to `false`.

### `.listen(startPos, callbackFn)`

Where `startPos` is the event stream position to start listen from.

The `callbackFn` should be a function. It will be called like this:
`callbackFn(pos, eventobj)` where `eventobj` is the object representing an event,
and `pos` is that event's position in the event stream.

### `.removeListener(callbackFn)`

Removes the `callbackFn` listener.

### `.removeAllListeners()`

Removes all listeners.

Optimizing
----------

* Keep your events small.
* Run `.add()` with the `resolvePosition` set to `false`.

Debugging
---------

Add a logging function as second argument to the class constructor, for debugging.

Example:

```
const XStreem = require('xstreem');
const eventstream = XStreem('./my-database-file', console.log);
```

Data corruption
---------------

If the log data becomes corrupt (broken JSON, checksum mismatch, or such), we will still split events by newline chars in the log file.
We will not stop processing the data stream on corrupt events.
Corrupt events will be enumbered (i.e. have a position number), but the data will just be `null` to the listeners.
However, in the `metadata` object also passed to the listeners, there will be a `raw` property with the raw data as a string.
Also, on errors, the `metadata` object will have an `error` property, with an node.js `Error` class object.

Event sizes
-----------

Events should not be too large.
There is a hard limit of 1 megabyte (as JSON serialized object), which will make this module hang/crash/flip. :)

Changelog
---------

* `2.0.0` - Metadata on events. New log format (because of metadata). `.add()` resolves the position of the new event.
* `1.2.0` - Added `.removeListener()` function.
* `1.1.1` - Better clean up solution for temporary logs.
* `1.1.0` - Fixed the clean up of temporary log files on process exit.
* `1.0.0` - Initial version.
