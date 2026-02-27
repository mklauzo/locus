from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0006_hotel_smtp'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aiassistant',
            name='ollama_url',
            field=models.CharField(blank=True, default='http://ollama:11434', max_length=500),
        ),
    ]
