import React from 'react';
import loader  from 'webaudio-buffer-loader';
import WebAudioScheduler from 'web-audio-scheduler';
import MashupRing from './mashup_ring';
import Channel from './channel';
import MetronomeContainer from './metronome_container';

const path = './stems';
const BEATS_PATH = './stems/beats';
const MELODIES_PATH = './stems/melodies';
const ACAPELLAS_PATH = './stems/acapellas';
const CIRCUMFERENCE = Math.PI * 2;
const GREENISH = "#59b2a1";
const DEFAULT_CHANNEL_GAIN = 0.5;

const TimeSlices = {
	FOUR: 4,
	EIGHT: 8,
	SIXTEEN: 16,
	THIRTYTWO: 32
};

const bpm = 160;
const TIME_SLICE = 4;

class App extends React.Component {

	constructor(props) {

		super(props);

		this.circles = {};
		this.resetTracks = this.resetTracks.bind(this);

		this.drawAtRad = this.drawAtRad.bind(this);
		this.createAudioPipeline = this.createAudioPipeline.bind(this);
		this.contxt = new AudioContext();

		this.startTracks = this.startTracks.bind(this);
		this.masterGain = this.contxt.createGain();
		this.masterGain.connect(this.contxt.destination);

	  this.sched = new WebAudioScheduler({ context: this.contxt });
		this.startMetronome = this.startMetronome.bind(this);
		this.metronome = this.metronome.bind(this);


		this.handlePlayToggle = this.handlePlayToggle.bind(this);
		this.tick = this.tick.bind(this);
		this.stopMetronome = this.stopMetronome.bind(this);
		this.setMasterGain = this.setMasterGain.bind(this);

		this.setCanvas = this.setCanvas.bind(this);
		this.makeChannelFromBuffers = this.makeChannelFromBuffers.bind(this);

		this.createAudioPipeline();
	}



	setCanvas(id, idx) {
		let canvas = document.querySelector(`#${id}`);
		let ctx = canvas.getContext("2d");
		ctx.lineWidth = 15;
		ctx.strokeStyle = GREENISH;
		let max = 2 * Math.PI;

		let circle = {
			canvas,
			ctx,
			max
		};

		this.circles[id] = circle;
	}

	drawAtRad(startingRadian, strokeLength, restart=false) {
		startingRadian -= Math.PI / 2.0;

		Object.keys(this.circles).forEach(circleKey => {
			let circle = this.circles[circleKey];
			let ctx = circle.ctx;

			if(restart){
				ctx.clearRect(0, 0, circle.canvas.width, circle.canvas.height);
			}

			ctx.beginPath();
			ctx.arc(100, 60, 50, startingRadian, startingRadian + strokeLength);
			ctx.stroke();
		});
	}

	createtrack(buffer, pathName, channelGainNode) {
		let source = this.contxt.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		let gainNode = this.contxt.createGain();
		let analyserNode = this.contxt.createAnalyser();
		source.connect(analyserNode);
		analyserNode.connect(gainNode);
		gainNode.connect(channelGainNode);
		channelGainNode.connect(this.masterGain);

		return {
			source,
			analyserNode,
			gainNode,
			pathName,
			setGain: (gain) => {
				gainNode.gain.value = gain;
			}
		};
	}

	createAudioPipeline() {

		let buffers = {
			beat: [
				`${BEATS_PATH}/backseat.wav`,
				`${BEATS_PATH}/yonkers.wav`,
				`${BEATS_PATH}/so_fresh.wav`
			],
			melody: [
				`${MELODIES_PATH}/1994.wav`,
				`${MELODIES_PATH}/lullaby.wav`,
				`${MELODIES_PATH}/mercy_me.wav`
			],
			acapella: [
				`${ACAPELLAS_PATH}/bob.wav`,
				`${ACAPELLAS_PATH}/green_light.wav`,
				`${ACAPELLAS_PATH}/gucci.wav`
			]
		};


		Object.keys(buffers).forEach(buffer => {
			this.makeChannelFromBuffers(buffers[buffer], channel => {
				this.props.initChannel(buffer, channel);

			});
		});
	}

	makeChannelFromBuffers(buffers, setChannel) {
		let tracks = [];
		let channelGainNode = this.contxt.createGain();

		loader(buffers, this.contxt, (err, loadedBuffers) => {
			loadedBuffers.forEach((buffer, idx) => {
				tracks.push(this.createtrack(buffer, buffers[idx], channelGainNode));
			});

			let channel = {
				tracks,
				channelGainNode,
				selectedTrack: 0,
				setGain: (gain) => {
					channelGainNode.gain.value = gain;
				}
			};

			setChannel(channel);
			this.props.setChannelsLoaded(this.props.channelsLoaded + 1);
		});

	}

	metronome(e) {
		let t0 = e.playbackTime;

		this.resetTracks();

		for (var step = 0; step <= TIME_SLICE; step++) {
			let schedStartTime = t0 + (this.spb * step);
			if (step === TIME_SLICE) {
				this.sched.insert(t0 + (this.spb * TIME_SLICE), this.metronome);
			} else {
				this.sched.insert(schedStartTime, this.tick, {beat: step});
			}
		}
	}

	tick(e) {
		this.props.tick(TIME_SLICE);
		let arcSize = (CIRCUMFERENCE / (Number(TIME_SLICE) * 1.0));
		let startingRad = ((CIRCUMFERENCE / TIME_SLICE ) * e.args.beat);

		if(e.args.beat === (TIME_SLICE - 1)) {
			this.drawAtRad(startingRad, arcSize, true);
		} else {
			this.drawAtRad(startingRad, arcSize);
		}
	}

	handlePlayToggle() {
		if(!this.props.started) {
			this.startTracks();
			this.startMetronome();
			this.props.start();
		}  else if (this.props.playing) {
			this.contxt.suspend();
		} else {
			this.contxt.resume();
		}

		this.props.togglePlay();
	}

	startTracks() {
		Object.keys(this.props.channels).forEach(channel =>{
			this.props.channels[channel].tracks.forEach((track, idx) => {
				if(idx === 0){
					track.setGain(DEFAULT_CHANNEL_GAIN);
				} else {
					track.setGain(0);
				}
				track.source.start(0);
			});
		});

	}

	startMetronome() {
		this.setMasterGain(0.5);
		let timeSlice = TIME_SLICE;
		let bpmMultiplier = Math.log2(timeSlice/2);
		const spb = 60.0 / (bpm * bpmMultiplier);
		this.spb = spb;

		this.sched.start(this.metronome);
	}

	stopMetronome () {
		this.setMasterGain(0);
  }

	setMasterGain(gain) {
		this.masterGain.gain.value = gain;
	}

	resetTracks() {

		Object.keys(this.props.channels).forEach(channel => {
			this.muteAllTracks(this.props.channels[channel].tracks);
			let trackIdx = this.props.channels[channel].selectedTrack;
			this.props.channels[channel].tracks[trackIdx].setGain(DEFAULT_CHANNEL_GAIN);
		});

	}

	resetAllCircles(circles) {
		Object.keys(circles).forEach(circle => {
			circles[circle].ctx.strokeStyle = GREENISH;
		});
	}

	muteAllTracks(tracks) {
		tracks.forEach(channel => channel.setGain(0));
	}

	render() {

		let playerText = this.props.playing ? "STOP" : "START";

		if(this.props.channelsLoaded === 3){

			return (
				<div className="container">
					<nav className="navbar-container">
						<div className="logo"><h1>MashupBot</h1></div>
					</nav>
					<div className="main-content">

					<div className="metronome-container">
						<MetronomeContainer/>
					</div>

					<div className="mix-board">

						{Object.keys(this.props.channels).map((channel, idx) => {
							return (

								<div 	className="channel">
									<Channel
										tracks={this.props.channels[channel].tracks}
										channelName={channel}
										setChannelGain={this.props.channels[channel].setGain}
										defaultGain={DEFAULT_CHANNEL_GAIN}
										key={idx}
										/>
								</div>

							);
						})}

						<button onClick={this.handlePlayToggle}>{playerText}</button>
					</div>
					<div className="mashup-ring">
						{/* <h1> {this.props.beat} </h1> */}
						{/* <MashupRing setCanvas={this.setCanvas} canvasId={"mashupRing"}/> */}
					</div>
					</div>

				</div>
			);
	 	} else {
				return (
					<div>
					<h1> LOADING </h1>
					</div>
				);
			}
	}

}

export default App;
