import React, { useEffect, useRef, useState } from 'react';
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import styles from "../styles/videoComponent.module.css";
import server from '../environment';

const server_url = server;

var connections = {};

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
    ]
}

export default function VideoMeetComponent() {

    var socketRef = useRef();
    let socketIdRef = useRef();

    let localVideoref = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);
    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo] = useState([]);
    let [audio, setAudio] = useState();

    let [screen, setScreen] = useState();

    let [showModal, setModal] = useState(true);
    let [screenAvailable, setScreenAvailable] = useState();

    let [messages, setMessages] = useState([]);
    let [message, setMessage] = useState("");
    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true);
    let [username, setUsername] = useState("");

    const videoRef = useRef([]);
    let [videos, setVideos] = useState([]);

    useEffect(() => {
        getPermissions();
    }, []);

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoPermission) {
                setVideoAvailable(true);
            } else {
                setVideoAvailable(false);
            }

            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (audioPermission) {
                setAudioAvailable(true);
            } else {
                setAudioAvailable(false);
            }

            if (navigator.mediaDevices.getDisplayMedia) {
                setScreenAvailable(true);
            } else {
                setScreenAvailable(false);
            }

            if (videoAvailable || audioAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });
                if (userMediaStream && localVideoref.current) {
                    window.localStream = userMediaStream;
                    localVideoref.current.srcObject = userMediaStream;
                }
            }
        } catch (error) {
            console.log(error);
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
        }
    }, [video, audio]);

    const getUserMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop());
        } catch (e) { }

        window.localStream = stream;
        if (localVideoref.current) localVideoref.current.srcObject = stream;

        for (let id in connections) {
            if (id === socketIdRef.current) continue;

            connections[id].addStream(window.localStream);

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
                    })
                    .catch(e => console.log(e));
            });
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false);
            setAudio(false);

            try {
                let tracks = localVideoref.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            } catch (e) { }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoref.current) localVideoref.current.srcObject = window.localStream;

            for (let id in connections) {
                connections[id].addStream(window.localStream);

                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => {
                            socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
                        })
                        .catch(e => console.log(e));
                });
            }
        });
    }

    const getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
                .then(getUserMediaSuccess)
                .catch((e) => console.log(e));
        } else {
            try {
                let tracks = localVideoref.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            } catch (e) { }
        }
    }

    useEffect(() => {
        if (screen !== undefined) {
            getDisplayMedia();
        }
    }, [screen]);

    const getDisplayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDisplayMediaSuccess)
                    .catch((e) => console.log(e));
            }
        }
    }

    const getDisplayMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop());
        } catch (e) { }

        window.localStream = stream;
        if (localVideoref.current) localVideoref.current.srcObject = stream;

        for (let id in connections) {
            if (id === socketIdRef.current) continue;

            connections[id].addStream(window.localStream);

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
                    })
                    .catch(e => console.log(e));
            });
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false);

            try {
                let tracks = localVideoref.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            } catch (e) { }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            if (localVideoref.current) localVideoref.current.srcObject = window.localStream;

            getUserMedia();
        });
    }

    const gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message);

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }));
                            }).catch(e => console.log(e));
                        }).catch(e => console.log(e));
                    }
                }).catch(e => console.log(e));
            }

            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e));
            }
        }
    }

    // --- CHAT SECTION ---

    const addMessage = (data, sender, socketIdSender) => {
        setMessages(prev => [...prev, { sender, data }]);

        if (socketIdSender !== socketIdRef.current) {
            setNewMessages(prev => prev + 1);
        }
    }

    const sendMessage = () => {
        if (!message.trim()) return;

        socketRef.current.emit('chat-message', message, username);
        setMessage("");
    }

    // 🔥 FIXED PART: connect to socket server and clear messages on new join
    const connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false });

        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            // Use pathname as unique room identifier (simple fix)
            socketRef.current.emit("join-call", window.location.pathname);

            socketIdRef.current = socketRef.current.id;

            // CLEAR previous messages when user joins a new meeting
            setMessages([]);
            setNewMessages(0);

            socketRef.current.on('chat-message', addMessage);

            socketRef.current.on('user-left', (id) => {
                setVideos(videos => videos.filter(video => video.socketId !== id));
            });

            socketRef.current.on('user-joined', (id, clients) => {
                clients.forEach(socketListId => {

                    if (socketListId === socketIdRef.current) return;

                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

                    connections[socketListId].onicecandidate = (event) => {
                        if (event.candidate) {
                            socketRef.current.emit(
                                'signal',
                                socketListId,
                                JSON.stringify({ ice: event.candidate })
                            );
                        }
                    };

                    connections[socketListId].onaddstream = (event) => {
                        let exists = videoRef.current.find(v => v.socketId === socketListId);

                        if (!exists) {
                            const newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                            };
                            setVideos(prev => {
                                const updated = [...prev, newVideo];
                                videoRef.current = updated;
                                return updated;
                            });
                        }
                    };

                    if (window.localStream) {
                        connections[socketListId].addStream(window.localStream);
                    }
                });
            });
        });
    };

    // Silence & black helpers
    const silence = () => {
        let ctx = new AudioContext();
        let oscillator = ctx.createOscillator();
        let dst = oscillator.connect(ctx.createMediaStreamDestination());
        oscillator.start();
        ctx.resume();
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
    }
    const black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height });
        canvas.getContext('2d').fillRect(0, 0, width, height);
        let stream = canvas.captureStream();
        return Object.assign(stream.getVideoTracks()[0], { enabled: false });
    }

    // Button handlers
    const handleVideo = () => setVideo(!video);
    const handleAudio = () => setAudio(!audio);
    const handleScreen = () => setScreen(!screen);

    const handleEndCall = () => {
        try {
            let tracks = localVideoref.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        } catch (e) { }
        window.location.href = "/";
    }

    // Chat modal toggle
    const openChat = () => {
        setModal(true);
        setNewMessages(0);
    }
    const closeChat = () => setModal(false);

    // Username form submit
    const connect = () => {
        setAskForUsername(false);
        getMedia();
    }

    // Kick off media + socket connection
    const getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    }

    return (
        <div>
            {askForUsername ?
                <div>
                    <h2>Enter into Lobby</h2>
                    <TextField
                        label="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        variant="outlined"
                    />
                    <Button variant="contained" onClick={connect} disabled={!username.trim()}>Connect</Button>
                    <div>
                        <video ref={localVideoref} autoPlay muted></video>
                    </div>
                </div>
                :
                <div className={styles.meetVideoContainer}>

                    {showModal &&
                        <div className={styles.chatRoom}>
                            <div className={styles.chatContainer}>
                                <h1>Chat</h1>
                                <div className={styles.chattingDisplay} style={{ overflowY: 'auto', maxHeight: '60vh' }}>
                                    {messages.length ? messages.map((item, idx) => (
                                        <div key={idx} style={{ marginBottom: 20 }}>
                                            <p style={{ fontWeight: 'bold' }}>{item.sender}</p>
                                            <p>{item.data}</p>
                                        </div>
                                    )) : <p>No Messages Yet</p>}
                                </div>
                                <div className={styles.chattingArea} style={{ display: 'flex', gap: 10 }}>
                                    <TextField
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        placeholder="Type your message"
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
                                    />
                                    <Button onClick={sendMessage} variant="contained" color="primary" disabled={!message.trim()}>Send</Button>
                                </div>
                            </div>
                        </div>
                    }

                    <div className={styles.buttonContainers}>
                        <IconButton onClick={handleVideo} style={{ color: "white" }}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleEndCall} style={{ color: "red" }}>
                            <CallEndIcon />
                        </IconButton>
                        <IconButton onClick={handleAudio} style={{ color: "white" }}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable &&
                            <IconButton onClick={handleScreen} style={{ color: "white" }}>
                                {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        }

                        <Badge badgeContent={newMessages} max={999} color="warning">
                            <IconButton onClick={() => setModal(!showModal)} style={{ color: "white" }}>
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>

                    <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted></video>

                    <div className={styles.conferenceView}>
                        {videos.map(video => (
                            <div key={video.socketId}>
                                <video
                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }}
                                    autoPlay
                                />
                            </div>
                        ))}
                    </div>
                </div>
            }
        </div>
    );
}
