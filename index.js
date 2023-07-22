const crypto = require('crypto');
const disposablefile = require('disposablefile');
const fs = require('fs');
const indicesOf = require('indicesof');
const os = require('os');
const process = require('process');

const hostname = os.hostname();
const pid = process.pid;

class XStreem {

	constructor(filename, logFn) {

		// Use temporary file if none was given:
		if (!filename) {
			this.filename = disposablefile.fileSync({ prefix: 'xstreem-' });
		} else {
			this.filename = filename;
		}

		this.debug = logFn;

		this.isDrained = true;

		this._listeners = [];
		this._onDrainListeners = [];
		this.readDescriptor = null;
		this.writeDescriptor = null;

		this.readPosition = 0;

		this.buffer = Buffer.alloc(1048576); // 1 megabyte
		this.bufferBytePos = 0;

		this.pollLock = false;
		this.pollInterval = null;

		this.events = [];

		this._paused = 0;
	}

	pause() {
		this._paused++;
	}

	resume() {
		if (this._paused > 0) this._paused--;
		if (this._paused === 0) setImmediate(() => this._poll());
	}

	add(event, options) {
		const defaultOptions = { resolvePosition: true, returnMeta: false };
		options = {...defaultOptions,  ...(options || {})};

		this._ensureWriteDescriptor();

		let { hash, time, nonce, json } = this._generateEventEntry(event);

		const promise = new Promise((resolve, reject) => {

			if (options.resolvePosition) {

				const eventListener = (pos, event, metadata) => {
					if (this.debug) this.debug('listener waited for checksum: ' + hash);
					if (metadata.checksum === hash && metadata.host === hostname && metadata.nonce === nonce && metadata.pid === pid && metadata.time === time) {
						this.removeListener(eventListener);
						if (this.debug) this.debug('listener resolves position: ' + pos);
						resolve(pos);
					}
				};
				this.listen(this.readPosition, eventListener, true);

			}

			fs.write(this.writeDescriptor, json + '\n', (err, written, src) => {

				if (err) {
					if (this.debug) this.debug('Error writing event to log.');
					return reject(err);
				}

				if (this.debug) this.debug('Successfully wrote event to log. Checksum: ' + hash);
				
				if (!options.resolvePosition) {
					resolve();
				}

				setImmediate(() => this._poll());
			});
		});

		if (options.returnMeta) {
			return {
				promise,
				checksum: hash,
				time,
				nonce,
				host: hostname,
				pid
			}
		} else {
			return promise;
		}
	}

	onDrain(cb) {
		if (typeof cb === 'function') {
			this._onDrainListeners.push({ cb });
		}
	}

	removeOnDrainListener(cb) {
		this._onDrainListeners.forEach((listener, index) => { if (listener.cb === cb) { listener.deleted = true; } });
		setImmediate(() => this._onDrainListenersCleanUp());
	}

	removeAllOnDrainListeners() {
		this._onDrainListeners.forEach(listener => listener.deleted = true);
		setImmediate(() => this._onDrainListenersCleanUp());
	}

	removeListener(cb) {

		// Listeners might be removed from listener callbacks, so we dont want to delete the listeners immediately,
		// because then we are altering the array while looping through it (in _poll). So, we mark the listeners as
		// deleted and do the listeners clean up later.

		let listenerCounter = 0;
		this._listeners.forEach((listener, index) => {
			if (listener.cb === cb) {
				listener.deleted = true;
			} else {
				if (!listener.internal) {
					listenerCounter++;
				}
			}
		});
		setImmediate(() => this._listenersCleanUp());
	}

	removeAllListeners() {
		this._listeners.forEach((listener, index) => { if (listener.internal !== true) { listener.deleted = true; } });
		setImmediate(() => this._listenersCleanUp());
	}

	_generateEventEntry(event) {
		const time = new Date().getTime();
		const nonce = crypto.randomBytes(16).toString('hex');
		const fullEvent = { e: event, h: hostname, n: nonce, p: pid, t: time };
		const fullEventJson = JSON.stringify(fullEvent);
		const hash = crypto.createHash('sha256').update(fullEventJson, 'utf8').digest('hex');
		const fullEventJsonPlusChecksum = fullEventJson.replace(/^{/, '{"c":"' + hash + '",');
		return { hash, time, nonce, json: fullEventJsonPlusChecksum };
	}

	_onDrainListenersCleanUp() {
		const indices = [];
		this._onDrainListeners.forEach((listener, index) => { if (listener.deleted) { indices.push(index); } });

		indices.sort((a, b) => b - a);
		indices.forEach(index => {	
			this._onDrainListeners.splice(index, 1);
		});
	}

	_listenersCleanUp() {
		const indices = [];
		this._listeners.forEach((listener, index) => { if (listener.deleted) { indices.push(index); } });

		indices.sort((a, b) => b - a);
		indices.forEach(index => {	
			if (this.debug) this.debug('Removed listener on index ' + index + '. - ' + this._listeners.length + ' listeners still listening.');
			this._listeners.splice(index, 1);
		});
		if (this._listeners.length === 0 && this.pollInterval !== null) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}

	listen(pos, cb, internal) {
		this._ensureFileDescriptors()
		this._listeners.push({ pos, cb, internal: internal ? true : false });
		if (this.pollInterval === null) {
			this.pollInterval = setInterval(() => this._poll(), 1000);
		}

		if (pos < this.readPosition) {
			this._restartReadDescriptor();
		}

		if (this.debug) {
			if (internal) {
				this.debug('Successfully added internal event listener (at index ' + (this._listeners.length - 1) + ') from pos ' + pos);
			} else {
				this.debug('Successfully added event listener (at index ' + (this._listeners.length - 1) + ') from pos ' + pos);
			}
		}
		setImmediate(() => this._poll());
	}

	_ensureFileDescriptors() {
		this._ensureWriteDescriptor();
		if (this.readDescriptor !== null) return;

		this.readDescriptor = fs.openSync(this.filename, 'r', 0o666);
		if (this.debug) this.debug('Opened file read descriptor: ' + this.filename);
	}

	_restartReadDescriptor() {
		// To force a new descriptor number, we open the new one before closing the old one.
		const newDescriptor = fs.openSync(this.filename, 'r', 0o666);
		fs.close(this.readDescriptor, () => {});
		this.readDescriptor = newDescriptor;
		this.readPosition = 0;
		this.events.length = 0;
		this.bufferBytePos = 0;
		if (this.debug) this.debug('Restarted file read descriptor: ' + this.filename);
	}

	_ensureWriteDescriptor() {
		if (this.writeDescriptor !== null) return;
		this.writeDescriptor = fs.openSync(this.filename, 'a', 0o666);
		if (this.debug) this.debug('Opened file write descriptor: ' + this.filename);
	}

	_parseBufParts(buf, sep, scope) {
		const indices = indicesOf(sep, buf, 0, scope);
		let blobstart = 0;
		const blobs = 
			indices
				.map(index => {
					const newBuf = Buffer.allocUnsafe(index - blobstart);
					buf.copy(newBuf, 0, blobstart, index);
					blobstart = index + sep.length;
					return newBuf;
				});
		buf.copy(buf, 0, blobstart, scope);
		return blobs;
	}

	_callListeners(eventData, eventStr) {
		const prevrd = this.readDescriptor;
		if (this.debug) this.debug('Looping through ' + this._listeners.length + ' listeners.');
		for (let listener of this._listeners) {
			if (listener.deleted) {
				if (this.debug) this.debug('Listener marked as deleted.');
			} else if (listener.pos === this.readPosition) {
				this._callListener(listener, eventData, eventStr);
			} else {
				if (this.debug) this.debug('Listener at position ' + listener.pos + ', but we are at position ' + this.readPosition);
			}
			if (prevrd !== this.readDescriptor) return; // Stop loop if new read descriptor when calling listener
		}
	}

	_callListener(listener, eventData, eventStr) {
		if (this.debug) this.debug('Calling listener callback for event#' + this.readPosition + '.');
		listener.pos++;

		// We do a deep clone of the eventData object each time, to make sure that one callback does
		// not mess upp the data for the rest of the callbacks.
		// Just cloning (i.e. {...eventData}) would not do a deep clone,
		// but JSON.parse(JSON.stringify(eventData)) does:

		const metadata = JSON.parse(JSON.stringify({
			checksum: eventData.c,
			host: eventData.h,
			nonce: eventData.n,
			pid: eventData.p,
			raw: eventStr,
			time: eventData.t
		}));
		if (eventData.error) metadata.error = new Error(eventData.error);

		const response = listener.cb(
			this.readPosition,
			JSON.parse(JSON.stringify(eventData.e)),
			metadata
		);
		if (this.debug) this.debug('Listener callback responded with', response);
	}

	_processEvent() {
		const event = this.events.shift();
		
		const prevrd = this.readDescriptor;

		let eventStr;
		let eventData;
		try {
			eventStr = event.toString();
		} catch (err) {
			eventData = {
				e: null,
				error: 'Encoding failure.'
			};
		}

		if (!eventData) {
			try {
				eventData = JSON.parse(eventStr);
			} catch (err) {
				// Could not JSON parse the event string:
				eventData = {
					e: null,
					error: 'Can not JSON parse event data.'
				};
			}
		}

		if (!eventData.error) {
			const hash = crypto.createHash('sha256').update(eventStr.replace(/^{"c":"[^"]+",/, '{'), 'utf8').digest('hex');
			if (hash !== eventData.c) {
				eventData.e = null;
				eventData.error = 'Checksum mismatch.';
			}
		}

		this._callListeners(eventData, eventStr);

		if (prevrd === this.readDescriptor) {
			this.readPosition++;
		}
	}

	_poll() {
		if (this.readDescriptor === null) return;

		if (this._paused > 0) return;

		if (this.pollLock) return;
		this.pollLock = true;

		const prevrd = this.readDescriptor;

		fs.read(this.readDescriptor, this.buffer, this.bufferBytePos, 8192, null, (err, bytesRead, buffer) => {

			if (prevrd !== this.readDescriptor) return this.pollLock = false; // _restartReadDescriptor() did run.

			if (bytesRead > 0) {
				this.isDrained = false;

				if (this.debug) this.debug('Read ' + bytesRead + ' bytes.');
				this.bufferBytePos += bytesRead;
				const events = this._parseBufParts(this.buffer, "\n", this.bufferBytePos);
				if (events.length > 0) {
					if (this.debug) this.debug('Got ' + events.length + ' event(s):', events.toString());
					this.bufferBytePos = this.bufferBytePos - events.reduce((acc, curr) => acc + curr.length, events.length);

					for (let event of events) {
						this.events.push(event);
					}
				}
			}

			while (this.events.length > 0 && prevrd === this.readDescriptor && this._paused === 0) {
				this._processEvent();
			}


			if (this.events.length === 0 && bytesRead === 0 && this._paused === 0 && this.isDrained === false) {
				if (this.debug) this.debug('Draining.');
				this.pause();
				this.isDrained = true;
				this._listenersCleanUp();
				this._onDrainListenersCleanUp();
				if (this._onDrainListeners.length > 0) {
					let resolveFirst;
					let promise = new Promise((resolve, reject) => resolveFirst = resolve);
					this._onDrainListeners.forEach(listener => {
						promise = promise.then(listener.cb).catch(err => {});
					});
					promise.then(() => this.resume());
					resolveFirst();
				} else {
					this.resume();
				}
			}

			this.pollLock = false;
			if (bytesRead > 0 || this.events.length > 0) setImmediate(() => this._poll());
		});

	}

}

module.exports = XStreem;
