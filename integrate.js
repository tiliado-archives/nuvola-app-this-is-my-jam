/*
 * Copyright 2014 Jan Vlnas <git@jan.vlnas.cz>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */


(function(Nuvola)
{
    "use strict";

    // Create media player component
    var player = Nuvola.$object(Nuvola.MediaPlayer);

    // Handy aliases
    var PlaybackState = Nuvola.PlaybackState;
    var PlayerAction = Nuvola.PlayerAction;

    var clickOnElement = Nuvola.clickOnElement;

    // Create new WebApp prototype
    var WebApp = Nuvola.$WebApp();

    // l10n
    var C_ = Nuvola.Translate.pgettext;
    var ngettext = Nuvola.Translate.ngettext;

    var ACTION_LIKE = "toggle-like";

    //////////////////////// TMIJ bindings

    /**
     * Get an element of a given type from the document.
     * Element IDs are contained within a closure to prevent usage outside functions' scope.
     * @param  {string} type Control type, e.g. prev, next, play, like…
     * @return {Element}
     */
    var getElement = (function elementSelector()
    {
        var ELEM_IDS = {
            prev: "backwards",
            next: "forwards",
            title: "track-title",
            artist: "artist-name",
            play: "playPause",
            like: "controlLike",
            playAll: "playAllJams"
        };

        return function(type)
        {
            return document.getElementById(ELEM_IDS[type]);
        };
    })();

    /**
     * Helper for global controls; check if the named element is clickable.
     * @param  {string} type Name of the element to check
     * @return {bool}
     */
    var canPressButton = function(type)
    {
        var el = getElement(type);
        return el && !el.hasAttribute("disabled");
    };

    /**
     * Return an URL of the image of (hopefully) currently playing track
     * NOTE: TIMJ does not expose art for a currently playing track globally,
     *   so this may cause some problems e.g. when visiting a profile page.
     *   For example, when you visit an unrelated profile page and the player skips to the next song,
     *   then we have no reference to update image until you visit playlist or current song's profile.
     **/
    var getArtLocation = (function(){
        var current = null;
        return function() {
            var img = null;
            var holder = null;

            try {
                // On the playlist page, things are easy
                holder = document.querySelector(".blackHole.playing, .blackHole.paused, .blackHole.spin");
                if (holder)
                {
                    img = holder.querySelector("img");
                    current = img.getAttribute("data-thumb");
                    return current;
                }

                // Let's try a profile page
                holder = document.getElementById("jamHolder");
                // we care only if the profile page is for a playing or paused track
                if (holder && holder.querySelector(".playing, .paused, .spin"))
                {
                    img = holder.querySelector("img");
                    current = img.src;
                    return current;
                }
            }
            catch (ex) {
            }
            // elsewhere cache the last known value
            return current;
        };

    })();


    /**
     * Get play state depending on the play button
     * @return {PlaybackState}
     */
    var getState = function()
    {
        var el = getElement("play");

        if (!el)
        {
            return PlaybackState.UNKNOWN;
        }

        if (el.classList.contains("playing"))
        {
            return PlaybackState.PLAYING;
        }
        else if (el.classList.contains("paused"))
        {
            return PlaybackState.PAUSED;
        }

        return PlaybackState.UNKNOWN;
    };

    var getLikeState = function()
    {
        var el = getElement("like");
        if (!el) {
            return false;
        }
        return el.classList.contains("liked");
    };

    var doPlayPause = function()
    {
        var play = getElement("play");
        clickOnElement(play);
    };

    var doPlay = function(state)
    {
        if (state !== PlaybackState.UNKNOWN)
        {
            doPlayPause();
            return true;
        }
        var playAll = getElement("playAll");
        if (playAll)
        {
            clickOnElement(playAll);
            return true;
        }
        return false;
    };

    var buildTrack = function()
    {
        return Object.seal(
        {
            title: null,
            artist: null,
            artLocation: null,
            album: null
        });
    };
    //////////////////////// END TMIJ bindings

    WebApp._onInitAppRunner = function(emitter)
    {
        Nuvola.WebApp._onInitAppRunner.call(this, emitter);

        Nuvola.actions.addAction("playback", "win", ACTION_LIKE, C_("Action", "Love"), null, null, null, false);
    };


    // Initialization routines
    WebApp._onInitWebWorker = function(emitter)
    {
        Nuvola.WebApp._onInitWebWorker.call(this, emitter);

        this.playbackState = PlaybackState.UNKNOWN;

        // Connect handler for signal ActionActivated
        Nuvola.actions.connect("ActionActivated", this);

        var state = document.readyState;
        if (state === "interactive" || state === "complete")
        {
            this._onPageReady();
        }
        else
        {
            document.addEventListener("DOMContentLoaded", this._onPageReady.bind(this));
        }
    };

    // Page is ready for magic
    WebApp._onPageReady = function()
    {
        player.addExtraActions([ACTION_LIKE]);

        this.state = PlaybackState.UNKNOWN;
        // Start update routine
        this.update();
    };

    // Extract data from the web page
    WebApp.update = function()
    {

        // Playback state
        this.state = getState();
        player.setPlaybackState(this.state);

        // track parameters
        var track = buildTrack();
        try
        {
            track.title = getElement("title").textContent;
            track.artist = getElement("artist").textContent;
            track.artLocation = getArtLocation();
        }
        catch (ex)
        {
        }
        player.setTrack(track);

        // action buttons
        var canPrev = false,
            canNext = false,
            canPlay = false,
            canPause = false;
        try
        {
            canPrev = canPressButton("prev");
            canNext = canPressButton("next");
            if (this.state === PlaybackState.PLAYING)
            {
                canPause = canPressButton("play");
            }
            else
            {
                canPlay = canPressButton("play") || canPressButton("playAll");
            }
        }
        catch (ex)
        {
        }
        // Update actions
        player.setCanGoPrev(canPrev);
        player.setCanGoNext(canNext);
        player.setCanPlay(canPlay);
        player.setCanPause(canPause);

        // extra actions
        Nuvola.actions.updateEnabledFlag(ACTION_LIKE, canPressButton("like"));
        Nuvola.actions.updateState(ACTION_LIKE, getLikeState());

        // Schedule update
        setTimeout(this.update.bind(this), 500);
    };

    // Handler of playback actions
    WebApp._onActionActivated = function(emitter, name, param)
    {
        switch (name)
        {
            case PlayerAction.PLAY:
                if (this.state !== PlaybackState.PLAYING)
                {
                    doPlay(this.state);
                }
                break;
            case PlayerAction.TOGGLE_PLAY:
                doPlay(this.state);
                break;
            case PlayerAction.PAUSE:
            case PlayerAction.STOP:
                if (this.state === PlaybackState.PLAYING)
                {
                    doPlayPause();
                }
                break;
            case PlayerAction.PREV_SONG:
                clickOnElement(getElement("prev"));
                break;
            case PlayerAction.NEXT_SONG:
                clickOnElement(getElement("next"));
                break;
            case ACTION_LIKE:
                clickOnElement(getElement("like"));
                break;
        }
    };

    WebApp.start();

})(this); // function(Nuvola)
