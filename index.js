module.exports = (basedir) => {
	const path = require('path');
	const gulpPath = _path => path.resolve(basedir, _path);
	const gulp = require('gulp');
	const webpack = require('webpack-stream');
	const named = require('vinyl-named');
	let plugins = require('gulp-load-plugins')({
		config: path.resolve(__dirname, "package.json"),
		pattern: ['gulp-*', 'gulp.*', '@*/gulp{-,.}*', 'fs', 'postcss-*', 'autoprefixer', 'merge-stream', 'del', 'webpack-stream', 'vinyl-named'],
	});
	const fs = require('fs');
	const configPath = gulpPath('./src/config.js');
	let isLive = false;
	let config = require(configPath);

	function err(err) {
		console.log(err);
		this.emit('end');
	}

	function groupTasks(name) {
		var tasks = gulp.tasks ? Object.keys(gulp.tasks)
			.sort() : gulp.tree()
				.nodes.sort();
		return tasks.filter(function (task) {
			return task.indexOf(name) != -1;
		});
	}

	function scssTask(name) {
		var options = {};
		var dest = config.scss[name].dest || config.scss.defaultDest;
		var source = gulp.src(config.scss[name].files)
			.pipe(plugins.sourcemaps.init());
		source = source.pipe(plugins.sass())
			.on('error', err)
		//.pipe(plugins.postcss([plugins.autoprefixer({ overrideBrowserslist: 'last 10 year' })])); // until it's fixed
		if (config.scss[name].header) {
			source = source.pipe(plugins.header(config.scss[name].header, {
				pkg: config.theme,
			}));
		}
		source = source.pipe(plugins.cleanCss({
			format: 'beautify',
			level: {
				2: {
					mergeMedia: true,
					mergeSemantically: true,
				},
			},
		}));
		var mergeStream = plugins.mergeStream();
		if (config.header) {
			source = source.pipe(plugins.header(config.header + "\n", {
				pkg: config.plugin,
			}));
		}
		if (!isLive) {
			var pipe1 = source.pipe(plugins.clone())
				.pipe(plugins.sourcemaps.write('.'))
				.pipe(gulp.dest(dest));
			if (config.scss[name].noMinify === true) {
				return pipe1.pipe(plugins.livereload());
			}
			mergeStream.add(pipe1);
		}
		var pipe2 = source.pipe(plugins.clone())
			.pipe(plugins.rename({
				suffix: '.min',
			}))
			.pipe(plugins.cleanCss());
		pipe2 = pipe2 = isLive ? pipe2 : pipe2.pipe(plugins.sourcemaps.write('.'));
		pipe2 = pipe2.pipe(gulp.dest(dest));
		mergeStream.add(pipe2);
		return mergeStream.pipe(plugins.livereload());
	}

	function jsTask(name) {
		var options = {};
		var dest = config.js[name].dest || config.js.defaultDest;
		var source = gulp.src(config.js[name].files, {
			//read: false,
		})
			.pipe(plugins.vinylNamed())
			.pipe(plugins.webpackStream({
				mode: isLive ? "production" : "development",
				devtool: false,
				optimization: {
					namedModules: false,
					moduleIds: "hashed",
					minimize: isLive,
				},
				module: {
					rules: [{
						test: /\.js$/,
						loader: 'babel-loader',
						exclude: /node_modules/,
						query: {
							presets: [
								["@babel/preset-env", {
									"useBuiltIns": "usage",
									corejs: 3,
								}]
							],
							plugins: ["@babel/plugin-transform-modules-commonjs", "@babel/plugin-proposal-class-properties",],
						}
					}]
				}
			}));
		if (config.header) {
			source = source.pipe(plugins.header(config.header + "\n", {
				pkg: config.plugin,
			}))
				.pipe(plugins.header("\"use strict\";\n"));
		}
		var mergeStream = plugins.mergeStream();
		if (!isLive) {
			var pipe1 = source.pipe(plugins.clone())
				.pipe(plugins.sourcemaps.write('.'))
				.pipe(gulp.dest(dest));
			if (config.js[name].noMinify === true) {
				return pipe1.pipe(plugins.livereload());
			}
			mergeStream.add(pipe1);
		}
		var pipe2 = source.pipe(plugins.clone())
			.pipe(plugins.rename({
				suffix: '.min',
			}))
		pipe2 = isLive ? pipe2 : pipe2.pipe(plugins.sourcemaps.write('.'));
		pipe2 = pipe2.pipe(gulp.dest(dest));
		mergeStream.add(pipe2);
		return mergeStream.pipe(plugins.livereload());
	}
	Object.keys(config.scss)
		.forEach(function (group) {
			if (group != 'defaultDest') {
				gulp.task('scss:' + group, function () {
					return scssTask(group);
				});
			}
		});
	Object.keys(config.js)
		.forEach(function (group) {
			if (group != 'defaultDest') {
				gulp.task('js:' + group, function () {
					return jsTask(group);
				});
			}
		});
	Object.keys(config.assets)
		.forEach(function (group) {
			if (group != 'defaultDest') {
				gulp.task('copy:' + group, function () {
					var dest = config.assets[group].dest || config.copy.defaultDest;
					return gulp.src(config.assets[group].files, {
						allowEmpty: true,
					})
						.pipe(gulp.dest(dest))
						.pipe(plugins.livereload());
				});
			}
		});
	gulp.task('plugin:wp-pot', function () {
		return gulp.src(['*.php', '**/*.php', '!vendor/', '!vendor/**', '!build/**'])
			.pipe(plugins.wpPot({
				domain: config.plugin.textdomain,
				destFile: config.plugin.name + '.pot',
				package: config.plugin.name,
				bugReport: config.plugin.pluginUrl,
				lastTranslator: config.plugin.author + ' <' + config.plugin.email + '>',
				team: config.plugin.author + ' <' + config.plugin.email + '>',
			}))
			.pipe(gulp.dest('languages/' + config.plugin.name + '.pot'));
	});
	gulp.task('plugin:readme', function (cb) {
		var contents = ['# ' + config.plugin.title, 'Plugin Version: ' + config.plugin.version, 'Plugin URL: ' + config.plugin.pluginUrl, 'Author URL: ' + config.plugin.authorUrl, 'Author Email: ' + config.plugin.email, '# WordPress Requirement ', 'Requires at least: ' + config.plugin.requires, 'Tested upto: ' + config.plugin.tested, '# License ', 'License: ' + config.plugin.license, 'License URI: ' + config.plugin.licenseURI,];
		fs.writeFileSync('./README.md', contents.join('\n\n'));
		return cb();
	});
	gulp.task('plugin:mainfile', function () {
		return gulp.src(config.plugin.file)
			.pipe(plugins.replace(/(Plugin Name:\s?)(.*)/g, '$1' + config.plugin.title))
			.pipe(plugins.replace(/(Plugin URI:\s?)(.*)/g, '$1' + config.plugin.pluginUrl))
			.pipe(plugins.replace(/(Author:\s?)(.*)/g, '$1' + config.plugin.author))
			.pipe(plugins.replace(/(Author URI:\s?)(.*)/g, '$1' + config.plugin.authorUrl))
			.pipe(plugins.replace(/(Description:\s?)(.*)/g, '$1' + config.plugin.description))
			.pipe(plugins.replace(/(Version:\s?)(.*)/g, '$1' + config.plugin.version))
			.pipe(plugins.replace(/(Text Domain:\s?)(.*)/g, '$1' + config.plugin.textdomain))
			.pipe(plugins.replace(/(Requires PHP:\s?)(.*)/g, '$1' + config.plugin.php))
			.pipe(plugins.replace(/(License URI:\s?)(.*)/g, '$1' + config.plugin.licenseURI))
			.pipe(plugins.replace(/(License:\s?)(.*)/g, '$1' + config.plugin.license))
			.pipe(gulp.dest('./'));
	});
	gulp.task('plugin:plugin', function () {
		let _gulp = gulp.src(["includes/Plugin.php", "includes/Constants.php"]);
		Object.keys(config.constants)
			.forEach(key => {
				const regexp = new RegExp('(const ' + key + '\\s?\\=\\s?\\\'?\\"?)([^\\\'\\";]+)(\\\'?\\"?\\\s?;)', 'g');
				_gulp = _gulp.pipe(plugins.replace(regexp, '$1' + config.plugin[config.constants[key]] + '$3'));
			});
		return _gulp.pipe(gulp.dest('includes'));
	});
	gulp.task("plugin:composer", function (cb) {
		let json = JSON.parse(fs.readFileSync("./composer.json"));
		json.autoload = json.autoload || {};
		json.autoload['psr-4'] = {};
		json.autoload['psr-4'][`${config.plugin.namespace}\\`] = "includes";
		fs.writeFileSync('./composer.json', JSON.stringify(json, null, '\t'));
		return cb();
	});
	gulp.task('plugin:namespace', function () {
		return gulp.src(["**/*.php", '!vendor/', '!vendor/**'])
			.pipe(plugins.replace(/^(namespace\s)([^\\;]+)((\\[^;]+)?;)/gm, '$1' + config.plugin.namespace + '$3'))
			.pipe(gulp.dest('.'));
	});
	gulp.task("plugin:textdomain", function () {
		var pattern = /((esc_attr__|esc_attr_e|esc_html_e|esc_html__|__|_e)\((\"|\'))(((?!\((\'|\")).)*)((\'|\")\s?,\s?(\'|\"))([\w_-]+)((\'|\")\))/ig;
		return gulp.src(["**/*.php", '!vendor/', '!vendor/**',], {
			base: "."
		})
			.pipe(plugins.replace(pattern, '$1$4$7' + config.plugin.textdomain + '$11'))
			.pipe(gulp.dest('.'));
	});
	gulp.task('scss', gulp.series(...groupTasks('scss:')), function (cb) {
		return cb();
	});
	gulp.task('copy', gulp.series(...groupTasks('copy:')), function (cb) {
		return cb();
	});
	gulp.task('js', gulp.series(...groupTasks('js:')), function (cb) {
		return cb();
	});
	gulp.task('plugin', gulp.series(...groupTasks('plugin:')), function (cb) {
		return cb();
	});
	gulp.task('watch', function () {
		plugins.livereload.listen();
		Object.keys(config.assets)
			.forEach(function (group) {
				if (group != 'defaultDest') {
					gulp.watch(config.assets[group].files, gulp.series('copy:' + group));
				}
			});
		Object.keys(config.scss)
			.forEach(function (group) {
				if (group != 'defaultDest') {
					var watchGlob = typeof config.scss[group].watch != 'undefined' ? config.scss[group].watch : config.scss[group].files;
					gulp.watch(watchGlob, gulp.series('scss:' + group));
				}
			});
		Object.keys(config.js)
			.forEach(function (group) {
				if (group != 'defaultDest') {
					var watchGlob = typeof config.js[group].watch != 'undefined' ? config.js[group].watch : config.js[group].files;
					gulp.watch(watchGlob, gulp.series('js:' + group));
				}
			});
	});
	gulp.task('default', gulp.series(gulp.parallel('scss', 'js', 'copy', 'plugin'), 'watch'));
	gulp.task('live', gulp.series(function (cb) {
		isLive = true;
		return plugins.del(['assets', 'languages', 'build']);
	}, gulp.parallel('scss', 'js', 'copy', 'plugin')));
	/* Build and Zip */
	let distFiles = ['**', '!node_modules/', '!node_modules/**', '!build/', '!build/**', '!src/', '!src/**', '!.gitignore', '!.gitlab-ci.yml', '!Gulpfile.js', '!package.json', '!package-lock.json', '!composer.json', '!composer.lock', '!.browserslistrc', '!.git/', '!.git/**', '!auth.json'];
	gulp.task('deploy', gulp.series('live', function () {
		return gulp.src(distFiles, {
			allowEmpty: true,
		})
			.pipe(gulp.dest('build/'));
	}));
	gulp.task('build', gulp.series('live', function () {
		return gulp.src(distFiles, {
			allowEmpty: true,
		})
			.pipe(gulp.dest('build/' + config.plugin.name));
	}));
	return gulp;
};
