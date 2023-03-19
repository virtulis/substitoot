module.exports = {
	env: {
		browser: true,
		es2021: true,
		node: true
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 12,
		sourceType: 'module',
		tsconfigRootDir: __dirname,
		project: [
			`${__dirname}/tsconfig.json`,
			`${__dirname}/scripts/tsconfig.json`
		],
	},
	plugins: [
		'@typescript-eslint',
	],
	ignorePatterns: [
		'**/*.js',
		'**/*.d.ts',
	],
	rules: {
		
		indent: ['error', 'tab', {
			ignoredNodes: ['TemplateLiteral *'],
			flatTernaryExpressions: true,
		}],
		'linebreak-style': 'off',
		'no-trailing-spaces': ['error', { skipBlankLines: true }],
		'eol-last': ['error'],
		'no-debugger': 'off',
		
		'no-constant-condition': ['error', { checkLoops: false }],
		'no-extra-boolean-cast': 'off',
		
		'@typescript-eslint/ban-types': 'off', // no quick fix, revisit
		'@typescript-eslint/no-empty-interface': 'off',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/ban-ts-comment': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'@typescript-eslint/no-var-requires': 'off', // generally forced due to module system problem, lack of types or similar
		'@typescript-eslint/no-non-null-assertion': 'off', // might want to replace with an actual runtime assertion - later
		'@typescript-eslint/no-unused-vars': 'off', // lots of false positives and no auto fix
		
		'@typescript-eslint/no-loss-of-precision': ['error'],
		'no-template-curly-in-string': ['error'],
		'no-unreachable-loop': ['error'],
		'no-unsafe-optional-chaining': ['error'],
		
		'array-callback-return': ['error'],
		'dot-location': ['error', 'property'],
		'@typescript-eslint/dot-notation': ['error'],
		'no-else-return': ['error'],
		'no-eq-null': ['error'],
		'no-multi-spaces': ['error'],
		'no-sequences': ['error'],
		'no-throw-literal': ['error'],
		'no-unused-expressions': ['error', { allowTaggedTemplates: true, enforceForJSX: true }],
		'no-useless-return': ['error'],
		
		'@typescript-eslint/quotes': ['error', 'single', { allowTemplateLiterals: true },],
		'quote-props': ['error', 'as-needed',],
		'@typescript-eslint/semi': ['error', 'always'],
		'array-bracket-newline': ['error', 'consistent'],
		'array-bracket-spacing': ['error'],
		'array-element-newline': ['error', 'consistent'],
		'block-spacing': ['error'],
		'@typescript-eslint/brace-style': ['error', 'stroustrup', { allowSingleLine: true }],
		'@typescript-eslint/comma-dangle': ['error', {
			arrays: 'always-multiline',
			objects: 'always-multiline',
			imports: 'always-multiline',
			exports: 'always-multiline',
			functions: 'only-multiline',
			enums: 'always-multiline',
			generics: 'only-multiline',
			tuples: 'only-multiline',
		}],
		'@typescript-eslint/comma-spacing': ['error'],
		'comma-style': ['error'],
		'computed-property-spacing': ['error'],
		'@typescript-eslint/func-call-spacing': ['error'],
		'function-call-argument-newline': ['error', 'consistent'],
		'function-paren-newline': ['error', 'consistent'],
		'implicit-arrow-linebreak': ['error'],
		'jsx-quotes': ['error'],
		'key-spacing': ['error'],
		'@typescript-eslint/keyword-spacing': ['error'],
		'no-lonely-if': ['error'],
		'no-whitespace-before-property': ['error'],
		'nonblock-statement-body-position': ['error'],
		'object-curly-newline': ['error', { consistent: true }],
		'object-curly-spacing': ['error', 'always'],
		'object-property-newline': ['error', { allowAllPropertiesOnSameLine: true }],
		'operator-linebreak': ['error', 'before'],
		'semi-spacing': ['error'],
		'semi-style': ['error'],
		'space-before-blocks': ['error'],
		'unicode-bom': ['error'],
		'arrow-spacing': ['error'],
		'no-useless-computed-key': ['error'],
		'@typescript-eslint/member-delimiter-style': ['error'],
		'@typescript-eslint/no-namespace': 'off',
		
		'prefer-object-spread': ['error'],
		
		// this does not allow for single statements spanning multiple lines. and I think it should.
		// curly: ['error', 'multi-line', 'consistent'],
		
	},
	'overrides': [
		{
			'files': ['*.spec.ts'],
			'rules': {
				'no-unused-expressions': 'off'
			}
		}
	]
};
