package ru.planirovych.app.feature.home

/**
 * Small offline vector backup for each released planner outfit. The live
 * renderer uses the full website artwork. These silhouettes keep the chosen
 * outfit recognizable if the device cannot paint a WebView frame.
 */
internal fun nativeMascotSkinSvg(source:String,skinId:String,dark:Boolean,mode:String,frame:Int):String {
    val outline=if(dark)"#afa8ff" else "#8a83c9"
    val body=if(dark)"#5e5ca3" else "#b8b3ec"
    val clip="""<defs><clipPath id="native-outfit"><rect x="122" y="76" width="186" height="174" rx="65"/></clipPath></defs>"""
    val front=when(skinId){
        "cat" -> ""
        "northern" -> """
            <path d="M261 204Q296 200 300 229Q295 263 280 287L251 278Q267 252 261 222Z" fill="#378784" stroke="#235d5f" stroke-width="2.4"/>
            <path d="M134 182Q151 175 169 183Q216 207 276 183Q295 173 306 190L311 216Q301 242 216 250Q143 246 123 219L125 195Z" fill="#65b8b0" stroke="#26595e" stroke-width="2.5"/>
            <path d="M127 200Q211 240 307 200M125 218Q211 254 308 218" fill="none" stroke="#245d63" stroke-width="6"/>
            <path d="M142 106Q132 65 163 44Q185 28 216 34Q252 29 278 60Q292 82 286 106Z" fill="#65b8b0" stroke="#26585e" stroke-width="2.6"/>
            <circle cx="215" cy="33" r="15" fill="#c7e1d6"/>
            <rect x="139" y="91" width="150" height="19" rx="8" fill="#378784"/>
            <path d="M157 97H273M157 103H273" stroke="#c1e8dd" stroke-width="2.5" stroke-dasharray="4 4"/>
        """
        "maestro" -> """
            <path d="M159 91Q147 70 168 54Q198 33 242 48Q281 59 276 86Q251 100 208 94Z" fill="#b65375" stroke="#70233d" stroke-width="2.8"/>
            <path d="M162 87Q219 101 275 85L272 98Q215 109 161 99Z" fill="#70233d"/>
            <path d="M184 59Q214 45 249 57" fill="none" stroke="#ffdfd5" stroke-opacity=".5" stroke-width="3.5" stroke-linecap="round"/>
            <path d="M215 48l-4-10" stroke="#70233d" stroke-width="5" stroke-linecap="round"/>
            <path d="M170 214Q216 232 260 214L253 235L216 250L178 235Z M215 229L201 245L215 254L229 244Z" fill="#9c3b60" stroke="#70233d" stroke-width="2.8"/>
            <circle cx="215" cy="231" r="7" fill="#efc98b"/>
        """
        "zoomer" -> """
            <g clip-path="url(#native-outfit)">
            <path d="M119 181Q137 186 159 199Q183 211 215 217Q247 211 271 199Q293 186 311 181L317 220Q304 266 215 267Q126 266 113 220Z" fill="#91c3c0" stroke="#4c7f83" stroke-width="1.7"/>
            <g fill="#b9dedb" stroke="#4c7f83"><path d="M159 199Q183 211 215 217L200 232L174 222Z"/><path d="M271 199Q247 211 215 217L230 232L256 222Z"/></g>
            <circle cx="215" cy="237" r="2" fill="#ecf5f1"/><circle cx="215" cy="248" r="2" fill="#ecf5f1"/></g>
            <path d="M124 128Q119 115 122 99L119 86L125 74L122 65L134 59L133 51L147 47L153 38L167 41L177 33L188 38L202 31L213 36L225 30L235 37L249 35L257 43L271 40L278 49L292 49L295 60L305 64L302 75L312 84Q310 99 309 117L301 128L298 111L288 98L278 110L271 97L258 108L251 94L240 102L231 91L220 105L212 93L203 111L193 95L182 108L176 96L164 113L156 101L146 119L139 108L131 128Z" fill="#e4cca0" stroke="#9a805e" stroke-width="1.6"/>
            <path d="M130 85Q137 68 143 67M148 66Q160 54 169 54M188 56Q200 41 212 43M235 97Q247 82 250 61M282 89Q296 78 296 70" stroke="#f4e4c2" stroke-width="6" fill="none" stroke-linecap="round"/>
        """
        "pirate" -> """
            <g clip-path="url(#native-outfit)"><path d="M121 191Q147 190 171 211Q215 223 259 211Q283 190 309 191L319 262H111Z" fill="#e9dbc0"/>
            <path d="M125 191Q151 193 166 209L191 257H122ZM305 191Q279 193 264 209L239 257H308Z" fill="#68443b" stroke="#472b28" stroke-width="2"/>
            <path d="M137 195Q162 215 182 250M293 195Q268 215 248 250" fill="none" stroke="#e0b574" stroke-width="2.5"/></g>
            <path d="M122 130Q125 88 167 75Q214 58 261 77Q302 88 310 132Q265 108 215 110Q166 108 122 130Z" fill="#d94559" stroke="#a93045" stroke-width="2"/>
            <path d="M299 120Q319 92 348 98Q343 113 315 125Q339 125 351 158Q323 157 304 134Z" fill="#d94559" stroke="#852839" stroke-width="2"/>
            <path d="M194 131L278 165" stroke="#282a3a" stroke-width="7" stroke-linecap="round"/>
            <path d="M224 144Q245 135 262 150L269 165Q270 187 247 190Q224 190 222 167Z" fill="#33374e" stroke="#1e2130" stroke-width="2"/>
        """
        "wizard" -> """
            <path d="M132 199Q118 211 106 239L91 272Q115 290 156 286Q215 267 274 286Q315 290 339 272L324 239Q312 211 298 199L278 245Q215 258 152 245Z" fill="#514681" stroke="#2b263f" stroke-width="2.3"/>
            <path d="M149 209Q215 234 281 209L270 238Q215 260 160 238Z" fill="#7769aa" stroke="#443967" stroke-width="2"/>
            <ellipse cx="215" cy="94" rx="111" ry="18" fill="#303253" stroke="#a28568" stroke-width="2"/>
            <path d="M145 94Q181 46 218 22Q220 40 258 57L285 94Q215 109 145 94Z" fill="#55577f" stroke="#303253" stroke-width="2"/>
            <path d="M162 87Q215 99 271 87" fill="none" stroke="#efd6a0" stroke-width="5"/>
            <path d="M215 44l4 9 10 1-8 6 3 10-9-6-9 6 3-10-8-6 10-1Z" fill="#f4dcac"/>
            <circle cx="192" cy="75" r="3" fill="#e7ca8d"/><circle cx="246" cy="72" r="4" fill="#e7ca8d"/>
        """
        "ninja" -> """
            <g clip-path="url(#native-outfit)"><path d="M119 184Q141 190 158 209Q185 224 215 226Q245 224 272 209Q289 190 311 184L317 228Q297 270 215 270Q133 270 113 228Z" fill="#33374e" stroke="#23263b" stroke-width="2"/>
            <path d="M135 196Q172 224 221 237L250 251M294 194Q265 220 215 229L183 250" fill="none" stroke="#70748f" stroke-width="3"/></g>
            <path d="M124 106Q212 89 300 107L309 134Q219 113 121 136Z" fill="#33374e" stroke="#24263a" stroke-width="2.2"/>
            <path d="M299 120Q319 92 348 98Q343 113 315 125Q339 125 351 158Q323 157 304 134Z" fill="#33374e" stroke="#202235" stroke-width="2"/>
            ${if(mode=="idle"||mode=="hover") """<path d="M179 150L201 158L197 166L179 160ZM251 150L229 158L233 166L251 160Z" fill="#f3f4ff" stroke="#202438" stroke-width="3"/>""" else ""}
        """
        "space" -> """
            <g clip-path="url(#native-outfit)"><path d="M118 188Q215 209 312 188L319 260H111Z" fill="#d7e1f5" stroke="#91a4c5" stroke-width="2"/>
            <rect x="189" y="220" width="52" height="30" rx="10" fill="#9cafd1" stroke="#748aaf"/><circle cx="210" cy="235" r="9" fill="#79e4e8" stroke="#397e91" stroke-width="2"/></g>
            <path d="M97 159C97 80 142 38 215 38C288 38 333 80 333 159C333 192 318 209 298 218Q215 236 132 218C112 209 97 192 97 159Z" fill="#b4d7ff" fill-opacity=".13" stroke="#bbcffa" stroke-width="3"/>
            <path d="M121 110Q132 82 157 67" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="9" stroke-linecap="round"/>
            <path d="M120 211Q215 234 310 211L306 225Q215 249 124 225Z" fill="#d7e1f5" stroke="#8395b8" stroke-width="2"/>
        """
        else -> ""
    }
    var art=source
    if(skinId=="cat"){
        val ear="""<path d="M135 113C129 100 124 70 124 43Q124 30 136 37C156 49 178 66 192 89L185 108Z" fill="$body" stroke="$outline" stroke-width="3.5" stroke-linejoin="round"/><path d="M139 88Q132 66 135 48Q158 61 177 88L169 99Z" fill="#d9b9e3" stroke="#9c7eb7" stroke-width="1.2"/>"""
        val leftAngle=if(mode=="thinking") (kotlin.math.sin(frame*Math.PI/6)*10).toInt() else 0
        val rightAngle=if(mode=="thinking") (kotlin.math.sin(frame*Math.PI/4+1.3)*8).toInt() else 0
        art=art.replace("<rect x=\"122\"","""<g transform="rotate($leftAngle 160 100)">$ear</g><g transform="rotate($rightAngle 270 100)"><g transform="translate(430 0) scale(-1 1)">$ear</g></g><rect x="122"""")
    }
    if(skinId in setOf("northern","wizard","zoomer")) art=art.replace(Regex("""<path d="M215 77V58"[^>]*/>\s*<circle class="planik-antenna"[^>]*/>"""),"")
    if(skinId=="ninja"&&(mode=="idle"||mode=="hover"))art=art.replace(Regex("""<ellipse class="planik-eye"[^>]*/>"""),"")
    return art.replace("</svg>",clip+front+"</svg>")
}
