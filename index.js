const fs = require('fs');
const indicesOf = require('indicesof');
const onDeath = require('./ondeath');
const tempy = require('tempy');

class XStreem {

	constructor(filename, logFn) {

		// Use temporary file if none was given:
		if (!filename) {
			this.filename = tempy.file();
			onDeath(() => {
				// Remove temporary file if process exists:
				fs.unlink(this.filename);
			});
		} else {
			this.filename = filename;
		}

		this.debug = logFn;

		this._listeners = [];
		this.readDescriptor = null;
		this.writeDescriptor = null;

		this.readPosition = 0;

		this.buffer = Buffer.alloc(1048576); // 1 megabyte
		this.bufferBytePos = 0;

		this.pollLock = false;
		this.pollInterval = null;
	}

	add(event) {
		this._ensureWriteDescriptor();
		return new Promise((resolve, reject) => {
			fs.write(this.writeDescriptor, JSON.stringify(event) + "\n", (err, written, src) => {

				if (err) {
					if (this.debug) this.debug('Error writing event to log.');
					return reject(err);
				}

				if (this.debug) this.debug('Successfully wrote event to log.');
				
				resolve();
				
			});
		});
	}

	removeAllListeners() {
		if (this.pollInterval !== null) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
		this._listeners.length = 0;
	}

	listen(pos, cb) {
		this._ensureFileDescriptors()
		this._listeners.push({ pos, cb });
		if (this.pollInterval === null) {
			this.pollInterval = setInterval(() => this.poll(), 1000);
		}

		if (pos < this.readPosition) {
			this._restartReadDescriptor();
		}

		if (this.debug) this.debug('Successfully added event listener from pos ' + pos);;
		setImmediate(() => this.poll());
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

	poll() {
		if (this.readDescriptor === null) return;

		if (this.pollLock) return;
		this.pollLock = true;

		const prevrd = this.readDescriptor;

		fs.read(this.readDescriptor, this.buffer, this.bufferBytePos, 8192, null, (err, bytesRead, buffer) => {
			
			if (prevrd !== this.readDescriptor) return this.pollLock = false; // _restartReadDescriptor() did run.

			if (bytesRead === 0) return this.pollLock = false;
			if (this.debug) this.debug('Read ' + bytesRead + ' bytes.');
			this.bufferBytePos += bytesRead;
			const events = this._parseBufParts(this.buffer, "\n", this.bufferBytePos);
			if (events.length > 0) {
				if (this.debug) this.debug('Got ' + events.length + ' event(s).');
				this.bufferBytePos = this.bufferBytePos - events.reduce((acc, curr) => acc + curr.length, events.length);
				for (let event of events) {

					let eventStr;
					let eventData;
					try {
						eventStr = event.toString();
					} catch (err) {
						// Could not convert event to string:
						eventStr = 'null';
					}
					try {
						eventData = JSON.parse(eventStr);
					} catch (err) {
						// Could not JSON parse the event string:
						eventData = eventStr;
					}

					for (let listener of this._listeners) {
						if (listener.pos <= this.readPosition) {
							if (this.debug) this.debug('Calling listener callback for event#' + this.readPosition + '.');
							listener.pos++;
							listener.cb(this.readPosition, eventData);
							if (prevrd !== this.readDescriptor) {
								 // _restartReadDescriptor() did run. Lets not continue this loop.
								break;
							}
						}
					}
					if (prevrd !== this.readDescriptor) {
						 // _restartReadDescriptor() did run. Lets not continue this loop.
						break;
					}
					this.readPosition++;
				}
			}
			this.pollLock = false;
			if (bytesRead > 0) setImmediate(() => this.poll());
		});

	}

}

module.exports = XStreem;
