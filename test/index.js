const expect = require('chai').expect;
const fs = require('fs');
const os = require('os');
const process = require('process');
const td = require('testdouble');
const XStreem = require('../index');

describe('XStreem', () => {
  
	describe('constructor()', () => {

		it('should use a temporary file if no filename is given', () => {
			const eventStream0 = new XStreem();
			expect(eventStream0.filename).to.be.a('string');

			const eventStream1 = new XStreem();
			expect(eventStream1.filename).to.be.a('string');
		
			expect(eventStream0.filename).to.not.equal(eventStream1.filename);
		});

		it('should use the file from arguments, if it is given', () => {
			const filename = '/tmp/thisisatest';
			const eventstream = new XStreem(filename);
			expect(eventstream.filename).to.equal(filename);
		});
	});

	describe('add()', () => {

		it('should create a file descriptor for writing', () => {
			const eventstream = new XStreem();
			expect(eventstream.writeDescriptor).to.equal(null);
			return eventstream.add({ event: 'testevent' })
				.then(() => {
					// File descriptors are numbers:
					expect(eventstream.writeDescriptor).to.be.a('number');
				});
		});

		it('should not result in a open read descriptor, if pos is not expected in resolved result.', () => {
			const eventstream = new XStreem();
			expect(eventstream.readDescriptor).to.equal(null);
			return eventstream.add({ event: 'testevent' }, { resolvePosition: false } )
				.then(() => {
					expect(eventstream.readDescriptor).to.equal(null);
				});
		});
		
		it('should open a read descriptor, if pos is expected in resolved result.', () => {
			const eventstream = new XStreem();
			expect(eventstream.readDescriptor).to.equal(null);
			return eventstream.add({ event: 'testevent' })
				.then(() => {
					expect(eventstream.readDescriptor).to.be.a('number');
				});
		});
		
		it('should add event to log file', function() {
			this.timeout(10000);
			const eventstream = new XStreem();
			return eventstream.add({ event: 'testevent' })
				.then(() => {
					const content = fs.readFileSync(eventstream.filename, 'utf8');
					expect(content).to.contain('{"event":"testevent"}');
				})
				.then(() => eventstream.add({ event: 'another testevent' }))
				.then(() => {
					const content = fs.readFileSync(eventstream.filename, 'utf8');
					expect(content).to.contain('{"event":"testevent"}');
					expect(content).to.contain('{"event":"another testevent"}');
				})
		});

		it('should resolve the event position', function() {
			this.timeout(10000);
			const eventstream = new XStreem();
			const filename = eventstream.filename;
			return eventstream.add({ event: 'testevent' })
				.then(pos => {
					expect(pos).to.equal(0);
					return eventstream.add({ event: 'testevent' });
				})
				.then(pos => {
					expect(pos).to.equal(1);
					return eventstream.add({ event: 'testevent' });
				})
				.then(pos => {
					expect(pos).to.equal(2);
				})
				.then(() => {

					const nextEventStream = new XStreem(filename);
					return nextEventStream.add({ event: 'testevent' })
					.then(pos => {
						expect(pos).to.equal(3);
						return nextEventStream.add({ event: 'testevent' });
					})
					.then(pos => {
						expect(pos).to.equal(4);
						return nextEventStream.add({ event: 'testevent' });
					})
					.then(pos => {
						expect(pos).to.equal(5);
					})

				})
		});

		it('can return the event metadata', () => {
			const eventstream = new XStreem();
			let { promise, checksum, time, nonce, host, pid } = eventstream.add({ type: 'testEvent' }, { returnMeta: true });
			expect(promise).to.be.an.instanceof(Promise);
			expect(checksum).to.be.a('string');
			expect(time).to.be.a('number');
			expect(nonce).to.be.a('string');
			expect(host).to.be.a('string');
			expect(pid).to.be.a('number');
			return promise
				.then(pos => {
					expect(pos).to.be.a('number');
				});
		});

	});

	describe('listen()', () => {
		
		it('should ensure there are file descriptors for reading and writing', () => {
			const eventstream = new XStreem();
			expect(eventstream.readDescriptor).to.equal(null);
			expect(eventstream.writeDescriptor).to.equal(null);
			eventstream.listen(0, (pos, event) => {});
			expect(eventstream.readDescriptor).to.be.a('number');
			expect(eventstream.writeDescriptor).to.be.a('number');
			eventstream.removeAllListeners();
		});

		it('should add the callback to the listeners', () => {
			const cb = () => { };
			const eventstream = new XStreem();
			expect(eventstream._listeners.length).to.equal(0);
			eventstream.listen(0, cb);
			expect(eventstream._listeners.length).to.equal(1);
			expect(eventstream._listeners[0].pos).to.equal(0);
			expect(eventstream._listeners[0].cb).to.equal(cb);
			eventstream.removeAllListeners();
		});

	});

	describe('pause() and resume()', () => {
		it('should pause and resume immediately', function() {
			this.timeout(10000);
			const eventstream = new XStreem();
			return eventstream.add({ event: 'testevent' })
				.then(pos => {
					expect(pos).to.equal(0);
					expect(eventstream.readPosition).to.equal(1);
					return eventstream.add({ event: 'testevent' });
				})
				.then(pos => {
					expect(pos).to.equal(1);
					expect(eventstream.readPosition).to.equal(2);
					eventstream.pause();
					return eventstream.add({ event: 'testevent' }, { resolvePosition: false } )
						.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
						.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
						.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
						.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
						.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
						.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
						.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
						.then(() => new Promise((resolve, reject) => setTimeout(resolve, 1000)));
				})
				.then(() => {
					expect(eventstream.readPosition).to.equal(2);
					eventstream.resume();
					return new Promise((resolve, reject) => setTimeout(resolve, 1000));
				})
				.then(() => {
					expect(eventstream.readPosition).to.equal(10);
				})
				.then(() => {
					setTimeout(
						() =>
							eventstream.add({ event: 'testevent' }, { resolvePosition: false } )
								.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
								.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
								.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } ))
								.then(() => eventstream.add({ event: 'testevent' }, { resolvePosition: false } )),
						500
					);
					return new Promise((resolve, reject) => {
						eventstream.listen(10, (pos, event) => {
							if (pos === 10) {
								eventstream.pause();
								resolve();
							}
						});
					});
				})
				.then(() => {
					return new Promise((resolve, reject) => setTimeout(resolve, 500));
				})
				.then(() => {
					expect(eventstream.readPosition).to.equal(11);
					
					const promise = new Promise((resolve, reject) => {
						eventstream.listen(14, (pos, event) => {
							if (pos === 14) resolve();
						});
					});

					eventstream.resume();
					return promise;
				})
				.then(() => {
					expect(eventstream.readPosition).to.equal(15);
					eventstream.removeAllListeners();
				});
		});

	})

	describe('removeAllListeners()', () => {
		it('should remove all listeners', () => {
			const cb = () => { };
			const eventstream = new XStreem();
			expect(eventstream._listeners.length).to.equal(0);
			eventstream.listen(0, cb);
			expect(eventstream._listeners.length).to.equal(1);
			eventstream.removeAllListeners();
			expect(eventstream._listeners.filter(listener => !listener.deleted).length).to.equal(0);
		});
	});

	describe('removeListener()', () => {
		it('should remove the specified listener', function() {
			this.timeout(20000);

			const log = [];
			const listener0 = (pos, event) => { log.push([ 0, pos, event ]); }; 
			const listener1 = (pos, event) => { log.push([ 1, pos, event ]); }; 
			const listener2 = (pos, event) => { log.push([ 2, pos, event ]); };

			const listener0remover = () => { eventstream.removeListener(listener0); eventstream.removeListener(listener0remover); };
			const listener1remover = () => { eventstream.removeListener(listener1); eventstream.removeListener(listener1remover); };
			const listener2remover = () => { eventstream.removeListener(listener2); eventstream.removeListener(listener2remover); };

			const eventstream = new XStreem(null);

			eventstream.listen(0, listener0);
			eventstream.listen(0, listener1);
			eventstream.listen(0, listener2);
			eventstream.listen(1, listener0remover);
			eventstream.listen(2, listener1remover);
			eventstream.listen(3, listener2remover);

			return eventstream.add({ char: 'a' })
				.then(() => eventstream.add({ char: 'b' }))
				.then(() => eventstream.add({ char: 'c' }))
				.then(() => eventstream.add({ char: 'd' }))
				.then(() => eventstream.add({ char: 'e' }))
				.then(() => {
					return new Promise((resolve, reject) => {
						setTimeout(resolve, 3000);
					});
				})
				.then(() => {
					expect(log).to.deep.equal([
						[ 0, 0, { char: 'a'} ],
						[ 1, 0, { char: 'a'} ],
						[ 2, 0, { char: 'a'} ],

						[ 0, 1, { char: 'b'} ],
						[ 1, 1, { char: 'b'} ],
						[ 2, 1, { char: 'b'} ],

						[ 1, 2, { char: 'c'} ],
						[ 2, 2, { char: 'c'} ],

						[ 2, 3, { char: 'd'} ]
					]);
				});

		});
	});

	describe('_poll()', () => {

		describe('calls to registered listeners', () => {

			it('should happen if event occurs immediately after listen', function() {
				const testEvent = { type: 'testevent', abc: 123 };
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					eventstream.listen(0, (pos, event) => {
						resolve({ pos, event });
					});
					eventstream.add(testEvent);
				})
					.then(({ pos, event }) => {
						expect(pos).to.equal(0);
						expect(event).to.deep.equal(testEvent);
						expect(event).to.not.equal(testEvent); // It should be a similar object, not the same object
	
						eventstream.removeAllListeners();
					});
			});

			it('should happen if event occurs before listen', () => {
				const testEvent = { type: 'testevent', abc: 123 };
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					eventstream.add(testEvent);
					setTimeout(() => {
						eventstream.listen(0, (pos, event) => {
							resolve({ pos, event });
						});	
					}, 500);
				})
					.then(({ pos, event }) => {
						expect(pos).to.equal(0);
						expect(event).to.deep.equal(testEvent);
						expect(event).to.not.equal(testEvent); // It should be a similar object, not the same object
	
						eventstream.removeAllListeners();
					})
			});

			it('should work over many events', function() {
				this.timeout(10000);
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					eventstream.add({ char: 'a' })
						.then(() => eventstream.add({ char: 'b' }))
						.then(() => eventstream.add({ char: 'c' }))
						.then(() => eventstream.add({ char: 'd' }))
						.then(() => eventstream.add({ char: 'e' }))
						.then(() => {
							const events = [];
							eventstream.listen(0, (pos, event) => {
								events.push({ pos, event });
								if (pos === 10) resolve(events);
							});	
						})
						.then(() => eventstream.add({ char: 'f' }))
						.then(() => eventstream.add({ char: 'g' }))
						.then(() => eventstream.add({ char: 'h' }))
						.then(() => eventstream.add({ char: 'i' }))
						.then(() => eventstream.add({ char: 'j' }))
						.then(() => eventstream.add({ char: 'k' }));
				})
					.then(events => {
						expect(events).to.deep.equal([
							{ pos: 0, event: { char: 'a'} },
							{ pos: 1, event: { char: 'b'} },
							{ pos: 2, event: { char: 'c'} },
							{ pos: 3, event: { char: 'd'} },
							{ pos: 4, event: { char: 'e'} },
							{ pos: 5, event: { char: 'f'} },
							{ pos: 6, event: { char: 'g'} },
							{ pos: 7, event: { char: 'h'} },
							{ pos: 8, event: { char: 'i'} },
							{ pos: 9, event: { char: 'j'} },
							{ pos: 10, event: { char: 'k'} },
						]);
						eventstream.removeAllListeners();
					});
			});

			it('should update the listeners position', () => {
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					eventstream.listen(0, (pos, event) => {
						resolve({ pos, event });
					});	
					expect(eventstream._listeners[0].pos).to.equal(0);
					eventstream.add({ testEvent: 123 });
				})
					.then(({ pos, event }) => {
						expect(eventstream._listeners[0].pos).to.equal(1);
	
						eventstream.removeAllListeners();
					})
			});

			it('should return error event if string is not JSON-parse:able', function() {
				const str = 'this is not JSON-parseable';
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					eventstream.listen(0, (pos, event, metadata) => {
						resolve({ pos, event, metadata });
					});
					fs.appendFile(eventstream.filename, str + "\n", err => {
						if (err) reject(err);
					});
				})
					.then(({ pos, event, metadata }) => {
						expect(event).to.equal(null);
						expect(metadata.error).to.be.instanceof(Error);
						expect(metadata.raw).to.equal(str);

						eventstream.removeAllListeners();
					});
			});

			it('should handle splitted reads of an event', function() {
				this.timeout(10000);
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					eventstream.listen(0, (pos, event) => {
						resolve({ pos, event });
					});
					const event = eventstream._generateEventEntry({ split: 'works!' }).json + "\n";
					setTimeout(() => fs.appendFile(eventstream.filename, event.substr(0, 3), err => { if (err) reject(err); }), 1000);
					setTimeout(() => fs.appendFile(eventstream.filename, event.substr(3, 5), err => { if (err) reject(err); }), 2000);
					setTimeout(() => fs.appendFile(eventstream.filename, event.substr(8, 20), err => { if (err) reject(err); }), 3000);
					setTimeout(() => fs.appendFile(eventstream.filename, event.substr(28), err => { if (err) reject(err); }), 4000);
				})
					.then(({ pos, event }) => {
						expect(pos).to.equal(0);
						expect(event).to.deep.equal({ split: 'works!' });

						eventstream.removeAllListeners();
					});
			});

			it('should always return events in order', function () {
				this.timeout(10000);
				const eventstream = new XStreem(null);
				let counter = 0;
				return new Promise((resolve, reject) => {
				
					eventstream.listen(0, (pos, event) => {
						if (pos !== counter) reject(new Error('Events not in order - check 1.'));
						if (pos !== event.nr) reject(new Error('Events not in order - check 2.'));
						counter++;
						if (pos === 9999) resolve();
					});

					let events = '';
					for (let i = 0; i <= 9999; i++) {
						events = events + eventstream._generateEventEntry({ type: 'testevent', nr: i }).json + "\n";
					}
					fs.appendFile(eventstream.filename, events, err => { if (err) reject(err); });
	
				})
					.then(() => {
						eventstream.removeAllListeners();
					});
			});

			it('should not run listener callbacks if event pos is before listener pos', () => {
				const eventstream = new XStreem(null);
				let counter = 0;
				return new Promise((resolve, reject) => {
					eventstream.listen(5, (pos, event) => {
						if (pos < 5) {
							return reject(new Error('listener callback ran too early.'));
						}
						resolve();
					});

					for (let i = 0; i <= 5; i++) {
						eventstream.add({ testar: 'testar' });
					}
				})
					.then(() => {
						eventstream.removeAllListeners();
					});
			});

			it('should restart reading if new listener has a position before current read position', () => {
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					const log = [];
					eventstream.listen(0, (pos, event) => {
						log.push('a' + pos);
						if (pos === 3) {
							eventstream.listen(0, (pos, event) => {
								log.push('b' + pos);
								if (pos === 5) {
									eventstream.listen(3, (pos, event) => {
										log.push('c' + pos);
										if (log.indexOf('a7') !== -1 && log.indexOf('b7') !== -1 && log.indexOf('c7') !== -1) {
											setImmediate(() => resolve(log));
										}
									});
								}
							});
						}
					});

					for (var i = 0; i <= 7; i++) {
						eventstream.add({ testevent: i });
					}
				})
					.then(log => {
						expect(log).to.deep.equal([
							'a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'a4', 'b4', 'a5', 'b5', 'c3', 'c4', 'c5', 'a6', 'b6', 'c6', 'a7', 'b7', 'c7'
						]);

						eventstream.removeAllListeners();
					});
			});

			it('should have metadata', () => {
				const eventstream = new XStreem(null);
				return new Promise((resolve, reject) => {
					eventstream.listen(0, (pos, event, metadata) => {
						resolve({ pos, event, metadata });
					});
					eventstream.add({ test: 'abc' });
				})
					.then(({ pos, event, metadata }) => {
						expect(metadata.checksum).to.be.a('string');
						expect(metadata.host).to.equal(os.hostname());
						expect(metadata.nonce).to.be.a('string');
						expect(metadata.pid).to.equal(process.pid);
						expect((new Date().getTime()) - metadata.time).to.be.below(2000);

						eventstream.removeAllListeners();
					});

			});

		})

	});

	describe('_parseBufParts()', () => {

		it('should split buffer and return all splits except the last one', () => {

			// Since the last split does not have an ending separator,
			// we consider it to not be fully written (yet).
			// Hence, we do not return it.

			const buf = Buffer.from("abc\ndef\nghijklmnopqrstuv\nwxyz");

			const eventStream = new XStreem();
			const parts = eventStream._parseBufParts(buf, "\n", buf.length);

			expect(parts.length).to.equal(3);
			expect(parts[0].toString()).to.equal('abc');
			expect(parts[1].toString()).to.equal('def');
			expect(parts[2].toString()).to.equal('ghijklmnopqrstuv');
		});

		it('should move the last split to the beginning of the buffer', () => {

			const buf = Buffer.from("abc\ndef\nghijklmnopqrstuv\nwxyz");

			const eventStream = new XStreem();
			const parts = eventStream._parseBufParts(buf, "\n", buf.length);

			expect(buf.toString().substr(0, 4)).to.equal('wxyz'); // We know it should be four chars left.

		});

	});

	describe('drain listeners', () => {

		it('should not be called before anything has been read', function () {

			this.timeout(7000);

			let callCounter = 0;
			const eventStream = new XStreem();
			eventStream.onDrain(() => {
				callCounter++;
			});

			return new Promise((resolve, reject) => setTimeout(resolve, 5000))
				.then(() => {
					expect(callCounter).to.equal(0);
				});

		});

		it('should be called once after all event(s) has been read', function () {

			this.timeout(7000);

			let callCounter = 0;
			const eventStream = new XStreem();
			eventStream.onDrain(() => {
				callCounter++;
			});

			expect(eventStream._onDrainListeners.length).to.equal(1);

			eventStream.add({ testEvent: 123 });
			eventStream.add({ testEvent: 123 });
			eventStream.add({ testEvent: 123 });

			return new Promise((resolve, reject) => setTimeout(resolve, 5000))
				.then(() => {
					expect(callCounter).to.equal(1);
				});

		});

		it('should be called again after new events was added', function () {

			this.timeout(7000);

			let callCounter = 0;
			const eventStream = new XStreem();
			eventStream.onDrain(() => {
				if (callCounter === 0) {
					eventStream.add({ testEvent: 123 });
					eventStream.add({ testEvent: 123 });
					eventStream.add({ testEvent: 123 });
				}
				callCounter++;
			});

			eventStream.add({ testEvent: 123 });
			eventStream.add({ testEvent: 123 });
			eventStream.add({ testEvent: 123 });

			return new Promise((resolve, reject) => setTimeout(resolve, 5000))
				.then(() => {
					expect(callCounter).to.equal(2);
				});

		});

		it('should block new reads while drain callback is still running', function (done) {

			this.timeout(20000);

			const eventStream = new XStreem();

			let eventCounter = 0;
			let actions = '';
			eventStream.onDrain(() => {
				actions += 'D';
				if (eventCounter === 6) {
					try {
						expect(actions).to.equal('1D234D56D');
						done();
					} catch(err) {
						done(err);
					}
				}
				return new Promise((resolve, reject) => {
					setTimeout(resolve, 1000);
				});
			});

			function addEvent() {
				eventCounter++;
				actions += '' + eventCounter;
				eventStream.add({ testEvent: eventCounter });
				if (eventCounter < 6) {
					setTimeout(addEvent, 300);
				}
			}
			addEvent();

		});

		it('should be able to remove a listener', function (done) {

			this.timeout(20000);

			const eventStream = new XStreem();

			let eventCounter = 0;
			let actions = '';
			const onDrainD = () => actions += 'D';
			const onDrainE = () => actions += 'E';
			const onDrainF = () => actions += 'F';
			const onDrainG = () => actions += 'G';
			eventStream.onDrain(onDrainD);
			eventStream.onDrain(onDrainE);
			eventStream.onDrain(onDrainF);
			eventStream.onDrain(onDrainG);

			eventStream.listen(0, (pos, event) => {
				actions += '' + event.testEvent;
			});

			function addEvent() {
				eventCounter++;
				eventStream.add({ testEvent: eventCounter });
				if (eventCounter == 2) {
					eventStream.removeOnDrainListener(onDrainF);
				}
				if (eventCounter == 3) {
					eventStream.removeOnDrainListener(onDrainD);
				}
				if (eventCounter == 4) {
					eventStream.removeOnDrainListener(onDrainE);
				}
				if (eventCounter == 5) {
					eventStream.removeOnDrainListener(onDrainG);
				}
				if (eventCounter < 6) {
					setTimeout(addEvent, 300);
				} else {
					try {
						// Event 6 should not have happened yet:
						expect(actions).to.equal('1DEFG2DEG3EG4G5');
						eventStream.removeAllListeners();
						done();
					} catch (err) {
						eventStream.removeAllListeners();
						done(err);
					}
				}
			}
			addEvent();
		});	

		it('should be able to remove all listeners', function (done) {

			this.timeout(20000);

			const eventStream = new XStreem();

			let eventCounter = 0;
			let actions = '';
			eventStream.onDrain(() => {
				actions += 'D';
			});
			eventStream.onDrain(() => {
				actions += 'E';
			});
			eventStream.onDrain(() => {
				actions += 'F';
			});

			eventStream.listen(0, (pos, event) => {
				actions += '' + event.testEvent;
			});

			function addEvent() {
				eventCounter++;
				eventStream.add({ testEvent: eventCounter });
				if (eventCounter == 3) {
					eventStream.removeAllOnDrainListeners();
				}
				if (eventCounter < 6) {
					setTimeout(addEvent, 300);
				} else {
					try {
						// Event 6 should not have happened yet:
						expect(actions).to.equal('1DEF2DEF345');
						eventStream.removeAllListeners();
						done();
					} catch (err) {
						eventStream.removeAllListeners();
						done(err);
					}
				}
			}
			addEvent();

		});

	});

});
