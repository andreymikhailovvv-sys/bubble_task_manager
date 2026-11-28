package ru.planirovych.app.planik

/** Conservative amplitude-based endpointer for MediaRecorder. No extra audio
 * stream, no initial-silence submission. Continuous noise may require manual Send. */
internal class PlanikSpeechPause {
    var hasSpeech=false
        private set
    private var speechRun=0L
    private var lastSample=0L
    private var lastSpeech=0L
    private var floor=220.0

    fun sample(now:Long,amplitude:Int):Boolean {
        val dt=if(lastSample==0L)40L else (now-lastSample).coerceIn(0L,80L)
        lastSample=now
        val threshold=maxOf(650.0,floor*3.2)
        if(amplitude>=threshold) {
            speechRun+=dt
            if(speechRun>=240L)hasSpeech=true
            if(hasSpeech)lastSpeech=now
        }else{
            if(!hasSpeech) {
                speechRun=(speechRun-dt).coerceAtLeast(0L)
                floor=(floor*.94+amplitude.coerceAtMost(550)*.06).coerceIn(100.0,550.0)
            }
        }
        return hasSpeech && lastSpeech>0L && now-lastSpeech>=1800L
    }
}
