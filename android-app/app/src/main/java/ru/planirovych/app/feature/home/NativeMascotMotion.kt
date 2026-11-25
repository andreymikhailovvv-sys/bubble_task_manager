package ru.planirovych.app.feature.home

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

// A small cached frame sequence, not a timer that re-parses SVG on every tick.
// Coordinates match the original 345 x 275 Planik SVG.
internal fun mascotMotionFrameCount(skin:String,mode:String):Int =
    if(skin=="classic")2 else if(mode in setOf("idle","thinking","hover"))12 else 2

internal fun mascotMotionFrameMillis(skin:String,mode:String):Long = when {
    mode=="idle" && skin=="space" -> 550L
    mode=="idle" -> 260L
    mode=="thinking" && skin=="wizard" -> 420L
    mode=="thinking" && skin=="cat" -> 230L
    mode=="thinking" -> 240L
    mode=="hover" -> 170L
    else -> 300L
}

internal fun nativeMascotMotionSvg(skin:String,mode:String,frame:Int):String? {
    val wave=sin(frame*PI/6)
    val step=(wave*5).toInt()
    val hands=when(skin){
        "northern"->"#418d89"
        "pirate"->"#e6d4b3"
        "ninja"->"#454963"
        "space"->"#d7e1f5"
        "zoomer"->"#91c3c0"
        else->"#9290d8"
    }
    fun arms(leftX:Int,leftY:Int,rightX:Int,rightY:Int)=
        """<path d="M132 196Q139 226 $leftX $leftY M298 196Q291 226 $rightX $rightY" fill="none" stroke="$hands" stroke-width="17" stroke-linecap="round"/>"""
    fun star(x:Int,y:Int)= """<path d="M$x ${y-6}l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#f5dca0"/>"""
    return when {
        skin=="pirate"&&mode=="thinking" -> """
            <g class="native-pirate-map">
              ${arms(161,235+step,269,235-step)}
              <g transform="rotate($step 215 233)">
                <path d="M165 200Q158 194 170 192H261Q274 193 267 202L266 263Q273 272 260 273H170Q157 270 165 261Z" fill="#ecd3a0" stroke="#9b7244" stroke-width="2"/>
                <path d="M178 247Q165 222 197 211L209 218L227 205Q253 215 252 245L233 259L200 250Z" fill="#a7b27e" stroke="#a39d68" stroke-width="1.5"/>
                <path d="M180 244Q198 229 190 222T215 221Q239 220 227 239T243 250" fill="none" stroke="#806547" stroke-width="2.5" stroke-dasharray="4 4"/>
                <path d="M236 236l12 12m0-12-12 12" stroke="#ad3439" stroke-width="4" stroke-linecap="round"/>
                <ellipse cx="165" cy="232" rx="4" ry="31" fill="#c49c61"/><ellipse cx="266" cy="232" rx="4" ry="31" fill="#e9c989"/>
              </g>
            </g>
        """
        skin=="wizard"&&mode=="thinking" -> {
            val cards=(0..3).joinToString(""){i->
                val fan=if(frame<4)frame/3f else if(frame>9)(12-frame)/3f else 1f
                val x=215+((i-1.5f)*45*fan).toInt()
                val y=235-(sin((frame+i)*PI/6)*5).toInt()
                val angle=((i-1.5f)*11*fan).toInt()
                """<g transform="translate($x $y) rotate($angle)"><rect x="-17" y="-24" width="34" height="48" rx="4" fill="#534570" stroke="#e9c98d" stroke-width="2.5"/><rect x="-13" y="-20" width="26" height="40" rx="3" fill="#685990" stroke="#a88bc0"/>${star(0,0)}<circle cx="0" cy="0" r="11" fill="none" stroke="#d8b981"/></g>"""
            }
            """<g class="native-wizard-cards">${arms(170,249,260,249)}$cards</g>"""
        }
        skin=="space"&&mode=="thinking" -> {
            val sx=303+step
            val sy=55+step
            val waves=(0..2).joinToString(""){i->
                val phase=(frame+i*4)%12
                val y=sy+27+phase*3
                val w=7+phase
                """<path d="M${sx-w} $y Q$sx ${y+8} ${sx+w} $y" fill="none" stroke="#79e1eb" stroke-width="3" opacity="${1-phase/14f}"/>"""
            }
            """<g class="native-space-signal">${arms(151,222+step,279,222-step)}<g transform="translate($sx $sy) rotate(26)">
                <path d="M-13 0H-38M13 0H38" stroke="#b5c4dc" stroke-width="4"/>
                <rect x="-37" y="-10" width="24" height="20" rx="2" fill="#304d83" stroke="#9aaedc"/><rect x="13" y="-10" width="24" height="20" rx="2" fill="#304d83" stroke="#9aaedc"/>
                <path d="M-25-10V10M25-10V10M-37 0H-13M13 0H37" stroke="#7e9bcf"/>
                <rect x="-10" y="-12" width="20" height="24" rx="4" fill="#d7e1f5" stroke="#879bbb"/><circle cy="4" r="3" fill="#7ae3e9"/>
                <path d="M-14 15Q0 34 14 15Q0 22-14 15Z" fill="#e1e7f4" stroke="#8fa2bf"/>
            </g>$waves</g>"""
        }
        skin=="ninja"&&mode=="thinking" -> """
            <g class="native-ninja-notebook">
              ${arms(177,240,280,229+step)}
              <g transform="rotate(-9 215 230)">
                <rect x="169" y="200" width="92" height="65" rx="5" fill="#6f302f" stroke="#35232f" stroke-width="2"/>
                <path d="M173 204Q195 198 215 209Q235 198 257 204V258Q236 253 215 263Q194 253 173 258Z" fill="#f2e7ce" stroke="#bca98f"/>
                <path d="M215 209V261M180 218h27m-27 9h27m-27 9h27m-27 9h27M223 218h26m-26 9h26m-26 9h26m-26 9h26" stroke="#9c887b" stroke-width="1.8" fill="none"/>
                <path d="M215 209Q${215+(cos(frame*PI/6)*40).toInt()} 199 ${215+(cos(frame*PI/6)*40).toInt()} 204V258Q${215+(cos(frame*PI/6)*40).toInt()} 253 215 263Z" fill="#fff1d9" stroke="#bca98f"/>
              </g>
              <path d="M280 ${222+step}L234 ${206+step}M281 ${229+step}L235 ${213+step}" stroke="#d8b17e" stroke-width="3.5" stroke-linecap="round"/>
            </g>
        """
        skin=="northern"&&(mode=="idle"||mode=="hover") -> """
            <g class="native-northern-warmth">
              ${arms(185+step,222,245-step,222)}
              <ellipse cx="${185+step}" cy="222" rx="15" ry="11" fill="#c7e1d6" stroke="#719c96"/>
              <ellipse cx="${245-step}" cy="222" rx="15" ry="11" fill="#c7e1d6" stroke="#719c96"/>
              ${if(mode=="hover")(0..2).joinToString(""){i->val phase=(frame+i*4)%12;"""<circle cx="${215+phase*2}" cy="${207-phase*5}" r="${5+phase}" fill="#e3f7f5" opacity="${.65f*(1-phase/12f)}"/>"""}else ""}
            </g>
        """
        skin=="zoomer"&&mode=="idle" -> """
            <g class="native-zoomer-phone">${arms(184,231,267,232)}
              <g transform="rotate(-12 245 225)">
                <rect x="220" y="192" width="47" height="65" rx="7" fill="#879bad" stroke="#526579" stroke-width="2"/>
                <rect x="225" y="198" width="37" height="49" rx="3" fill="#283d60"/>
                <path d="M231 ${206+frame%4*3}h24m-24 10h18m-18 10h23" stroke="#a1dce5" stroke-width="3" stroke-linecap="round"/>
              </g>
              <path d="M187 231L${235+step} ${218-step}" stroke="#9792d7" stroke-width="12" stroke-linecap="round"/>
            </g>
        """
        skin=="ninja"&&(mode=="idle"||mode=="hover") -> """
            <g class="native-ninja-guard">
              ${arms(203+step,222,227-step,222)}
              <path d="M215 205Q206 204 201 214L193 229Q192 240 205 241L215 229Z M215 205Q224 204 229 214L237 229Q238 240 225 241L215 229Z" fill="#454963" stroke="#292c3d" stroke-width="2"/>
              ${if(mode=="hover")(0..5).joinToString(""){i->val phase=(frame+i*2)%12;"""<circle cx="${136+i*32}" cy="${230-phase*6}" r="${9+phase*2}" fill="#a1acc4" opacity="${.65f*(1-phase/12f)}"/>"""}else ""}
            </g>
        """
        skin=="wizard"&&(mode=="idle"||mode=="hover") -> {
            val y=230+step
            """<g class="native-wizard-orb">${arms(177,y,253,y)}<circle cx="215" cy="$y" r="${28+step/2}" fill="#8ba9e5" opacity=".25"/><circle cx="215" cy="$y" r="19" fill="#7886ca" stroke="#e3d6fa" stroke-width="2"/><ellipse cx="209" cy="${y-6}" rx="7" ry="5" fill="#d6f8ff"/>${star(188,y-22)}${star(245,y+5)}</g>"""
        }
        skin=="space"&&(mode=="idle"||mode=="hover") -> arms(151,222+step,279,222-step)
        skin=="pirate"&&mode=="idle" -> arms(151,231,279,231)
        skin=="pirate"&&mode=="hover" -> """${arms(151,231,255,129+step)}<path d="M248 ${124+step}l10 7" stroke="#9693d5" stroke-width="11" stroke-linecap="round"/>"""
        skin=="cat"&&mode=="thinking" -> null // Ear motion is drawn in the rear layer.
        else -> null
    }
}
