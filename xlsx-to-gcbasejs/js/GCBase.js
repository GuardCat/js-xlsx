/*jshint esversion: 6 */
/*jshint browser: true */

/**
 * База данных
 * @constructor
 * @require class: GCTable
 */
class GCBase {
	constructor(income) {
		if (!income) throw new Error("GCBase constructor error: no incoming parameters");
		this.cachedTables = {};
		if ( (typeof income) === "string" ) {

			if (income.length <= 30) {
				this.load(income);
			} else {
				this.reparse(income);			
			}
		
		/* Если передан объект, проверяем, это заголовок новой БД или БД целиком */
		} else if (typeof income === "object") {
			
			if (GCBase.checkDBData(income)) {
				this.__data = Object.assign({}, income);
                this.__tables = {};
			} else if (GCBase.checkDB(income)) {
				this.__data = Object.assign({}, income.__data);
				this.__tables = Object.assign({}, income.__tables);
			} else {
				throw new Error("GCBase constructor error: wrong database");
			}	

		} else {
			throw new Error("GCBase constructor error: wrong incoming parameter");
		}
	}
	
	get tables( ) {
		return Object.keys(this.__tables);
	}
	
	stringify (withCache = false){ 
		return withCache ?
			GCBase.__export.bind(this)( )
			: GCBase.__export.bind(this)("cachedTables")
		; 
	}
	
	stringifyCache() {
		return GCBase.__export.bind(this.cachedTables)( );
	}
	
	reparse(text) {
		let obj = JSON.parse(text);
		Object.assign(this, obj);
	}
	
	save(withCache = true) {
		localStorage.setItem( `GCBase:${this.__data.name}`, this.stringify(withCache) );
	}
	
	load(name) {
		name = name || this.__data.name;
		let data = localStorage.getItem(`GCBase:${name}`);
		
		if (!data) throw new Error(`GCBase load: database ${name} doesn't exists in localStorage.`);
		this.reparse(data);
		if (Object.keys(this.cachedTables).length === 0) this.recache();
	}
	
	/* Добавляем таблицу в экземпляр БД */
	addTable(name, captions) {
		if (!name) throw new Error("GCBase addTable: wrong name");
		if (!GCBase.checkCaptions(captions)) throw new Error("GCBase addTable: wrong captions");
		name = name.toString( );
		if (this.hasTable(name)) throw new Error("GCBase addTable: table alredy exists");

		this.__tables[name] = {};
		this.__tables[name].__captions = this.loadCaptions(captions);
		this.__tables[name].__rows = [ ];	
	}
	
	table(name, recache = false) {
		if (!this.hasTable(name)) throw new Error(`GCBase get table: table doesnt exist: ${name}.`);
		return new GCTable(name, this, recache);
	}
	
	/* Прогоняет заголовки через проверку и дополнение, копирует их в новый объект.*/
	loadCaptions(captions) {
		let result = {}, key;
		for (key in captions) {
			result[key] = Object.assign({}, GCBase.checkAndFixCaption(captions[key], this));
		}
		return result;
	}
	
	hasTable(tableName) {
		return tableName in this.__tables;
	}
	
	hasColumn(tableName, columnName) {
		return this.hasTable(tableName) && columnName in this.__tables[tableName].__captions;
	}
	
	get about() {
		let obj = {};
		obj.toString = ( ( ) => `${this.__data.name} v${this.__data.version}: ${this.__data.description}` ).bind(this);
		return Object.assign(obj, this.__data);
	}

	recache() {
		let 
			length = Object.keys(this.__tables).length, 
			key, 
			errors = 0,
			cacheOrder = [ ],
			wrongLinkFlag = false
		;

		if (!this._cacheOrder) {
			let wrongs = {};
			while (cacheOrder.length !== Object.keys(this.__tables).length) {
				for (key in this.__tables) {
					wrongLinkFlag = false;
					for (let i in this.__tables[key].__captions) {
						if(this.__tables[key].__captions[i].type === "link") {
							if ( !cacheOrder.some(el => el === this.__tables[key].__captions[i].table) ) { 
								wrongLinkFlag = true;
								if (wrongs[this.__tables[key].__captions[i].table]) throw new Error(`GCBase recache: wrong link ${this.__tables[key].__captions[i].table} in table ${key}`);
								wrongs[this.__tables[key].__captions[i].table] = true;
								break;
							}
							if ( !(this.__tables[key].__captions[i].table in this.__tables) ) throw new Error(`GCBase recache: wrong link ${this.__tables[key].__captions[i].table} in table ${key}`);
						}
					}
					if ( !wrongLinkFlag && !cacheOrder.some(el => el === key) ) cacheOrder.push(key);
					
				}
			}
			this.__cacheOrder = cacheOrder;
		}
		
		this.__cacheOrder.forEach( el => this.table(el).recache( ) );

	}
	
	/*
     * Проверяет заголовок таблицы (один конкретный столбец)
     * @param {object} caption — заголовок одного столбца
     * @return {object} дополненная копия заголовка
     * @throws отсутствие обязательных полей, не проставляемых автоматически, некорректный формат, неизвестный формат
     */
	static checkAndFixCaption(caption, base) {
		if( !(caption && caption instanceof Object && caption.type) ) throw new Error("GCBase addTable: wrong captions");
		let result = Object.assign({}, caption);

		switch (result.type) {
			case "text":
				result.format = "string";
				break;

			case "auto":
				result.format = "integer";
				result.unique = true;
				result.next = 0;
				break;

			case "link":
				if ( !("data" in result && "to" in result && "table" in result) ) throw new Error("GCBase addTable: wrong link caption");
				if ( result.multiply !== true && result.data.some ) throw new Error("GCBase addTable: multiply is false, but there is several keys in the caption.data");
				if ( !base.hasColumn(result.table, result.to) ) throw new Error(`GCBase addTable: wrong link, table or column doesn't exists (${result.table}:${result.to})`);
				break;

			case "date":
				if ( !(result.format && result.format instanceof Object && result.language && !(result.unique)) ) throw new Error("GCBase addTable: wrong date format");				
				break;

			case "rowdate":		
				break;
				
			case "flag":
				if (result.unique) throw new Error("GCBase addTable: flag can't contain unique: true");
				result.format = "boolean";
				break;
				
			case "number":
				result.format = result.format || "integer";
				if ( !["integer", "float", "precision"].some((el) => el === result.format) )  throw new Error(`GCBase addTable: number has unknown format: ${result.format}`);
				if (result.format === "precision") {
					result.precision = parseInt(result.precision);
					if(isNaN(result.precision)) throw new Error(`GCBase addTable: precision number needs quantity of numbers after comma in precision as Integer. Recieved: ${result.format}`);
				} 
				break;

			default:
				throw new Error(`GCBase addTable: unknown caption type: ${result.type}`);
		}
		return result;
	}

	
	/*
		Проверяет объект на соответствие формату __data
	*/
	static checkDBData(data) {
		if ( !(data && data.name && data.version && data.description) ) return false;
		if ( typeof data.version !== "number" ) return false;
		return true;
	}

	/*
		Проверяет экземпляр базы на соответствие формату
	*/
	static checkDB(data) {
		if ( !(data && data.__data && data.__tables) ) return false;
		return true;
	}
	
	/*
		Проверяет объект на соответствие формату __captions
		в данной версии — заглушка.
	*/
	static checkCaptions(captions) {
		if ( !(captions instanceof Object) ) return false;
		return true;
	}
	
	static __export(exclude) {
		return JSON.stringify(this, (key, val) => key === exclude ? undefined : val);
	}
}

class GCTable {
	constructor(name, base, recache) {
		this.__rows = base.__tables[name].__rows;

		this.captions = Object.assign({}, base.__tables[name].__captions);
		this.base = base;
		this.name = name;

		
		if ( !(name in base.cachedTables) || recache ) {
			base.cachedTables[name] = this.__fixRow(this.__rows);
		}
		this.rows = base.cachedTables[name];
		
		/* тюнинг rows, минимальная защита от шаловливых рук*/
		this.rows.add = this.__addRow.bind(this);
		this.rows.__push = this.rows.push; /* для внутреннего использования*/
		this.rows.splice = this.rows.shift = this.rows.push = this.rows.unshift = this.rows.pop = undefined;

	}
	

	stringify() { return GCBase.__export.bind(this.rows)(); }
	recache () { return this.base.table(this.name, true); }
	
	__fixRow(row) {
		if (row instanceof Array) { return row.map( this.__fixRow.bind(this) );} /*Если массив, обрабатываем каждую строку*/
		let column, fixedRow = { }, caption, parsedDate;
		for (column in row) {
			caption = this.captions[column];
			switch (caption.type) {
				case "link":
					if(!this.base.__tables[caption.table]) throw new Error(`GCTable fix row: wrong link: "${caption.to}"`);
					fixedRow[column] = {source: row[column], value: this.__valFromLink(caption, row[column], this.base.__tables[caption.table].__captions[caption.to], this.base.cachedTables[caption.table])};
					break;				
				case "date":
					parsedDate = row[column] instanceof Date ? row[column] : new Date(row[column]);
					if ( isNaN(parsedDate.getDay( )) ) throw new Error(`GCTable addRow: recieved wrong date: ${row[column]}`);
					if ( (caption.format && !caption.language) || (!caption.format && caption.language) ) throw new Error(`GCTable addRow: if you add format or language to date, you must use BOTH of the parameters.`);
					if ( !(caption.format instanceof Object) ) throw new Error(`GCTable addRow: date format can be only object. Recieved: ${caption.format}`);
					
					fixedRow[column]= caption.format ? 
						{source: parsedDate, value: parsedDate.toLocaleDateString(caption.language, caption.format)}
						: parsedDate
					; 
					break;
				case "number":
					switch (caption.format) {
						case "integer":
							fixedRow[column] = parseInt(row[column]);
							break;
						case "float":
							fixedRow[column] = parseFloat(row[column]);
							break;
						case "precision":
							fixedRow[column] = +( (+row[column]).toFixed(caption.precision) );
							break;
					}
					if ( isNaN(fixedRow[column]) ) throw new Error(`GCTable addRow: wrong number: ${fixedRow[column]}`);
					break;
				default:
					fixedRow[column] = row[column];
			}
		}
		return fixedRow;
	}
	
	__addRow(row) {
		if ("some" in row && "map" in row) return row.map(this.rows.add); /*Если массив, обрабатываем каждую строку*/

		for (let column in row) if ( !(column in this.captions) ) throw new Error (`GCTable adding row: Unknown key in row: ${column}`);

		for (let column in this.captions) { /* Обновляем заголовок для автоматического поля */
			if(this.captions[column].type === "auto") {
				row[column] = this.captions[column].next;
				this.base.__tables[this.name].__captions[column].next++;
			}
		}
		
		if (Object.keys(row).length !== Object.keys(this.captions).length) throw new Error (`GCTable adding row: The number of key in row and in captions doesn't match`);
		
		this.__rows.push(row);

		this.base.cachedTables[this.name].__push( this.__fixRow(row) );
		return this;
	}
    
	/* Получает значение по ссылке. Важно: на вход подаётся обработанный массив строк целевой таблицы! */
	__valFromLink(caption, key, targetCaption, targetTableRows) {
		let result = [ ], 
			rows = targetTableRows.filter( (row) => {
				return caption.multiply ? key.some( (keyVariant) => keyVariant === row[caption.to] ) : key === row[caption.to];
			} )
		;
		
		if (caption.data !== ":all") {
			rows.forEach( (row) => {
				let resultRow = {};

				if ("some" in caption.data) {
					caption.data.forEach( (k) => {
						resultRow[k] = row[k];
					} );
					result.push(resultRow);
				} else {
					result.push(row[caption.to]);
				}
			} );
		} else {
			result = rows;
		}
		return targetCaption.uniq === true ? result[0] : result;	
	}
	
}
/* TODO:

проверить ссылки на ссылки
добавить метод для выявления циклических ссылок
Добавление записи: проверка формата записи
* (-) rename(string: new name) rename table
* (-) removeColumn( colname, [filterfn | value ***strict equal***] ) will remove the whole column if don't recieve the second parameter.
* (-) addColumn(colname, object: description of the format for __captions
* (-) change(filterfn, changefn) prohibit to change link and qlink columns 
* (-) rows.delete(fn)
*/

/* DONE

 * написать метод recache для базы. Должен рекешировать таблицы с учетом ссылок: начинать с безссылочных таблиц и двигаться по 
   порядку таблиц так, чтобы не возникало ошибок. Простой вариант: пройтись recache по списку, при ошибках перекидывая проблемную
   таблицу в конец списка
 * добавить методы парсинга текста для таблицы и БД
 * добавить сохранение и получение таблицы из LS
 * добавить метод recache для перестройки таблиц
 * при добавлении записи убрать из чексуммы столбцы с типом auto, записывать их автоматически
 * класс таблиц
 * исправить ошибку: при возврате строки не подставляются данные по ссылке
 * Извлечение записи со ссылкой.
*/