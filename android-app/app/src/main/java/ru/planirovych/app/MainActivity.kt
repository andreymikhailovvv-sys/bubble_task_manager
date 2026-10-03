package ru.planirovych.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import ru.planirovych.app.feature.home.HomeScreen
import ru.planirovych.app.feature.home.HomeViewModel
import ru.planirovych.app.ui.theme.PlanirovychTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); enableEdgeToEdge()
        val app = application as PlanirovychApplication
        setContent {
            val vm: HomeViewModel = viewModel(factory=HomeViewModel.Factory(app.repository, app.themePreferences))
            val dark by vm.isDark.collectAsStateWithLifecycle()
            PlanirovychTheme(dark) {
                val nav = rememberNavController()
                NavHost(navController=nav, startDestination="home") { composable("home") { HomeScreen(vm, dark) } }
            }
        }
    }
}
